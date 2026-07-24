/**
 * 인증 영역 공용 fetch 래퍼.
 *
 * 표준 fetch와 시그니처가 동일한 드롭인 대체재로, 세션·계정 상태에 대한 전역 처리만 얹는다:
 *   - 401(세션 만료/무효 토큰): 쿠키를 정리하고 로그인 화면으로 보낸다.
 *   - 403 + MUST_CHANGE_PASSWORD: 비밀번호 변경 화면으로 보낸다.
 *   - 403 + ACCOUNT_DISABLED(비활성/잠금 계정): 로그아웃 처리한다.
 * 그 외 응답(권한 부족 403 포함)은 그대로 반환하므로 호출부의 res.ok / res.json()
 * 처리는 기존 fetch와 동일하게 동작한다.
 *
 * 로그인·가입·비밀번호 변경 페이지는 401/403을 자체 UI로 표시해야 하므로
 * 이 래퍼를 쓰지 않고 표준 fetch를 유지한다.
 */

/** 전역 처리로 요청이 중단됐을 때 throw되는 에러 (리다이렉트가 이미 시작된 상태) */
export class SessionRedirectError extends Error {
  constructor(readonly status: number) {
    super("세션 처리로 인해 화면을 이동합니다.");
    this.name = "SessionRedirectError";
  }
}

async function clearSessionAndRedirect(to: string): Promise<never> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 쿠키 정리 실패는 무시하고 이동한다.
  }
  window.location.href = to;
  throw new SessionRedirectError(401);
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    return clearSessionAndRedirect("/login");
  }

  if (res.status === 403) {
    const data = await res
      .clone()
      .json()
      .catch(() => null);
    if (data?.code === "MUST_CHANGE_PASSWORD") {
      window.location.href = "/change-password";
      throw new SessionRedirectError(403);
    }
    if (data?.code === "ACCOUNT_DISABLED") {
      return clearSessionAndRedirect("/login");
    }
  }

  return res;
}
