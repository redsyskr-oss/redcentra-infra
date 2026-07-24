import { NextRequest, NextResponse } from "next/server";
import { isMockApi } from "@/lib/mock/jsonServerClient";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  let backendSetCookies: string[] = [];

  // 목업 모드에서는 실 백엔드 세션이 없으므로 쿠키 정리만 하면 된다.
  if (!isMockApi()) {
    try {
      const backendUrl = `${process.env.INTERNAL_BACKEND_URL}/auth/logout`;
      const backendRes = await fetch(backendUrl, {
        method: "POST",
        headers: { Cookie: cookieHeader },
      });
      backendSetCookies = backendRes.headers.getSetCookie();
    } catch {
      // 백엔드 호출 실패 시에도 아래에서 로컬 쿠키는 정리한다.
    }
  }

  const response = NextResponse.json({ success: true });

  if (backendSetCookies.length > 0) {
    for (const cookie of backendSetCookies) {
      response.headers.append("Set-Cookie", cookie);
    }
  } else {
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");
  }

  return response;
}
