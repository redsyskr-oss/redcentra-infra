/**
 * json-server(server/db.json, MOCK_API_URL) 호출 헬퍼.
 * 목업 모드에서 [...path] 프록시가 실 백엔드 대신 이 클라이언트를 사용한다.
 */
const configuredMockApiUrl = process.env.MOCK_API_URL?.trim();
export const MOCK_API_URL = configuredMockApiUrl
  || (process.env.VERCEL === "1" ? "https://redsys-ten.vercel.app/api" : "http://localhost:4000");

export function isMockApi(): boolean {
  // MOCK_API=false로 바꾸면 auth 라우트/[...path] 프록시가 실 백엔드(INTERNAL_BACKEND_URL)로 전환된다.
  // 미설정(예: Vercel 목업 배포) 시에는 목업 모드가 기본값이다.
  return process.env.MOCK_API !== "false";
}

/**
 * json-server는 각 컬렉션의 `id` 필드만 문자열로 직렬화하고, 그 외 필드(예: rackId, categoryId
 * 같은 FK)는 시드 데이터에 넣은 원래 타입(숫자)을 그대로 유지한다. 그대로 두면 프런트에서
 * `rack.id === device.rackId` 같은 조인 비교가 전부 깨지므로, 응답을 반환하기 전에 모든 `id`
 * 필드를 숫자로 되돌려 프런트 입장에서는 항상 숫자 id만 존재하도록 정규화한다.
 */
function normalizeIds<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeIds(v)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "id" && typeof v === "string" && /^\d+$/.test(v)) {
        out[key] = Number(v);
      } else {
        out[key] = normalizeIds(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * 프록시를 거쳐 브라우저로 나가는 응답에서 비밀번호 등 민감 필드를 제거한다.
 * (로그인/비밀번호 변경 등 서버 내부 로직은 fetchMock을 직접 쓰므로 영향 없다.)
 */
const SENSITIVE_FIELDS = new Set(["userPassword"]);

function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripSensitive(v)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (!SENSITIVE_FIELDS.has(key)) out[key] = stripSensitive(v);
    }
    return out as T;
  }
  return value;
}

/**
 * json-server의 create()는 `{ id: randomId(), ...data }`로 아이템을 만들기 때문에, data에
 * 숫자 id를 실어 보내면 그대로 숫자로 저장돼 버린다. 그런데 이후 PATCH/DELETE/GET-by-id는
 * 전부 URL 파라미터(항상 문자열)와 `item.id === id` 엄격 비교를 하므로, 숫자로 저장된 id는
 * 생성 직후부터 절대 다시 찾을 수 없게 된다. POST 바디의 id는 항상 문자열로 보내 이 문제를
 * 원천 차단한다(순수 숫자 문자열은 응답 시 normalizeIds가 다시 숫자로 돌려주므로 프런트 입장에서
 * 보이는 타입은 동일하다).
 */
function stringifyOutgoingId(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (body == null) return body;
  const text = typeof body === "string" ? body : new TextDecoder().decode(body as ArrayBuffer);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "id" in parsed && typeof parsed.id !== "string") {
      parsed.id = String(parsed.id);
      return JSON.stringify(parsed);
    }
  } catch {
    // JSON이 아니면 그대로 통과
  }
  return text;
}

/**
 * Spring Data 스타일 pageable 파라미터(page=1-base, size) → json-server 페이지네이션 파라미터로 변환.
 * json-server 1.0 beta는 `_page`/`_per_page`를, 0.17.x(레거시, 예: 외부에 별도 호스팅한 목업)는
 * `_page`/`_limit`을 쓴다. 어느 버전이 MOCK_API_URL에 떠 있는지 몰라도 되게 둘 다 실어 보낸다
 * (서로 모르는 파라미터는 그냥 무시되므로 충돌하지 않는다).
 */
function toJsonServerQuery(search: URLSearchParams): { query: URLSearchParams; isPaged: boolean } {
  const query = new URLSearchParams(search);
  const page = query.get("page");
  const size = query.get("size");
  const isPaged = page !== null || size !== null;

  if (isPaged) {
    query.delete("page");
    query.delete("size");
    query.set("_page", page ?? "1");
    query.set("_per_page", size ?? "20");
    query.set("_limit", size ?? "20");
  }

  return { query, isPaged };
}

/**
 * 실 백엔드 프록시([...path]/route.ts)에서 사용하는 범용 패스스루.
 * actualPath: "v1/" 접두어를 제거한 나머지 경로 (예: "rooms", "backups/5")
 */
export async function proxyToMockBackend(
  actualPath: string,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  const { query, isPaged } = toJsonServerQuery(url.searchParams);
  const target = `${MOCK_API_URL}/${actualPath}${query.toString() ? `?${query}` : ""}`;

  const headers = new Headers(init.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("content-length");

  const body = init.method === "POST" ? stringifyOutgoingId(init.body) : init.body;
  const res = await fetch(target, { ...init, headers, body });

  if (isPaged && (!init.method || init.method === "GET")) {
    const size = Number(query.get("_per_page") ?? "20");
    const page = Number(query.get("_page") ?? "1");
    const raw = await res.json().catch(() => null);

    let content: unknown[];
    let totalElements: number;
    if (Array.isArray(raw)) {
      // json-server 0.17.x: 응답은 그냥 배열이고, 전체 개수는 X-Total-Count 헤더로 온다.
      content = raw;
      const headerCount = Number(res.headers.get("x-total-count"));
      totalElements = Number.isFinite(headerCount) ? headerCount : content.length;
    } else {
      // json-server 1.0 beta: { first, prev, next, last, pages, items, data: [...] }
      content = Array.isArray(raw?.data) ? raw.data : [];
      totalElements = typeof raw?.items === "number" ? raw.items : content.length;
    }

    const totalPages = Math.max(1, Math.ceil(totalElements / size));
    const body = {
      content: stripSensitive(normalizeIds(content)),
      page: { size, number: page, totalElements, totalPages },
    };
    return new Response(JSON.stringify(body), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentType = res.headers.get("content-type") ?? "application/json";
  if (contentType.includes("application/json")) {
    const text = await res.text();
    const normalized = text ? JSON.stringify(stripSensitive(normalizeIds(JSON.parse(text)))) : text;
    return new Response(normalized, { status: res.status, headers: { "Content-Type": contentType } });
  }

  const bodyBuf = await res.arrayBuffer();
  return new Response(bodyBuf, { status: res.status, headers: { "Content-Type": contentType } });
}

/** json-server 컬렉션을 직접 조회할 때 쓰는 단순 헬퍼 (auth 목업 등에서 사용) */
export async function fetchMock<T>(path: string): Promise<T | null> {
  const res = await fetch(`${MOCK_API_URL}${path}`);
  if (!res.ok) return null;
  return normalizeIds(await res.json());
}

export async function patchMock<T>(path: string, data: unknown): Promise<T | null> {
  const res = await fetch(`${MOCK_API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  return normalizeIds(await res.json());
}

export async function postMock<T>(path: string, data: unknown): Promise<T | null> {
  const res = await fetch(`${MOCK_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringifyOutgoingId(JSON.stringify(data)),
  });
  if (!res.ok) return null;
  return normalizeIds(await res.json());
}
