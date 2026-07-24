import { NextRequest, NextResponse } from "next/server";
import { isMockApi } from "@/lib/mock/jsonServerClient";
import { authenticateUser, makeMockToken } from "@/lib/mock/authService";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, password } = body;

  if (!userId || !password) {
    return NextResponse.json(
      { error: "userId and password are required" },
      { status: 400 },
    );
  }

  if (isMockApi()) {
    const result = await authenticateUser(userId, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 401 });
    }
    const response = NextResponse.json({ success: true, mustChangePassword: result.mustChangePassword });
    response.cookies.set("access_token", makeMockToken(result.memberId), {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  try {
    const backendUrl = `${process.env.INTERNAL_BACKEND_URL}/auth/login`;
    const backendRes = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    const loginData = await backendRes.json().catch(() => ({}));
    const response = NextResponse.json({ success: true, mustChangePassword: loginData.mustChangePassword === true });
    for (const cookie of backendRes.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 },
    );
  }
}
