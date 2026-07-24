import { NextRequest, NextResponse } from "next/server";
import { isMockApi, proxyToMockBackend } from "@/lib/mock/jsonServerClient";
import { getUserInfo, parseMockToken } from "@/lib/mock/authService";

// .env 설정: http://localhost:8080/api/v1
const BACKEND_URL = process.env.INTERNAL_BACKEND_URL!;

/** 목업 모드: json-server(server/db.json)로 패스스루 + auth/me 특별 처리 */
async function proxyRequestMock(request: NextRequest, actualPath: string): Promise<NextResponse> {
  const cookieHeader = request.headers.get("cookie") ?? "";

  // 쿠키 존재 여부만이 아니라 목업 토큰 형식(mock.<memberId>)까지 검증한다.
  const memberId = parseMockToken(cookieHeader);
  if (memberId == null) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (actualPath === "auth/me") {
    const userInfo = await getUserInfo(memberId);
    if (!userInfo) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(userInfo);
  }

  const url = new URL(request.url);
  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  try {
    const res = await proxyToMockBackend(actualPath, url, {
      method: request.method,
      headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
      body,
    });
    const responseBody = await res.arrayBuffer();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    console.error("[Mock Proxy Error]", error);
    return NextResponse.json(
      { error: "json-server(mock backend)가 응답하지 않습니다. `pnpm server`로 목업 서버를 실행하세요." },
      { status: 503 },
    );
  }
}

function extractCookieValue(
  setCookieHeaders: string[],
  name: string,
): string | undefined {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`${name}=([^;]*)`));
    if (match) return match[1];
  }
  return undefined;
}

async function refreshAccessToken(cookieHeader: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    });
    if (!res.ok) return null;
    return res.headers.getSetCookie();
  } catch {
    return null;
  }
}

async function proxyRequest(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader.includes("access_token=")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { path } = context.params; // ["api", "v1", "rooms"] 형태

  // ─── 경로 중복(v1/v1) 방지 핵심 로직 ───
  // path 배열에서 "v1"을 찾아 그 다음 요소부터만 합칩니다.
  const v1Index = path.indexOf("v1");
  const actualPathArray = v1Index !== -1 ? path.slice(v1Index + 1) : path;
  const actualPath = actualPathArray.join("/");

  if (isMockApi()) {
    return proxyRequestMock(request, actualPath);
  }

  try {
    const url = new URL(request.url);

    // 최종 주소: http://localhost:8080/api/v1 + / + rooms
    const backendUrl = `${BACKEND_URL}/${actualPath}${url.search}`;

    // ─── 헤더 구성 (브라우저 쿠키를 그대로 전달) ───
    const headers = new Headers();
    const skipHeaders = ["host", "connection", "content-length"];

    request.headers.forEach((value, key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    const body =
      request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : undefined;

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      body,
    };

    let res = await fetch(backendUrl, fetchOptions);
    let refreshedCookies: string[] | null = null;

    // 401/403 발생 시 토큰 갱신 시도
    if (res.status === 401 || res.status === 403) {
      refreshedCookies = await refreshAccessToken(cookieHeader);
      const newAccessToken =
        refreshedCookies && extractCookieValue(refreshedCookies, "access_token");

      if (newAccessToken) {
        headers.set(
          "Cookie",
          cookieHeader.replace(/access_token=[^;]*/, `access_token=${newAccessToken}`),
        );
        res = await fetch(backendUrl, { ...fetchOptions, headers });
      } else {
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
      }
    }

    // 응답 반환
    const responseBody = await res.arrayBuffer();
    const responseHeaders = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    const response = new NextResponse(responseBody, {
      status: res.status,
      headers: responseHeaders,
    });

    // 갱신된 access_token을 브라우저 쿠키에도 반영
    if (refreshedCookies) {
      for (const cookie of refreshedCookies) {
        response.headers.append("Set-Cookie", cookie);
      }
    }

    return response;
  } catch (error) {
    console.error("[Proxy Error]", error);
    return NextResponse.json({ error: "Backend service unavailable" }, { status: 503 });
  }
}

// Next.js 메서드 매핑
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, { params: await params });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, { params: await params });
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, { params: await params });
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, { params: await params });
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, { params: await params });
}
