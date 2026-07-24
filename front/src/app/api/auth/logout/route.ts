import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  let backendSetCookies: string[] = [];

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
