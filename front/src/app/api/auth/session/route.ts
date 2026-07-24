import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader.includes("access_token=")) {
    return NextResponse.json({ isLoggedIn: false });
  }

  try {
    const backendUrl = `${process.env.INTERNAL_BACKEND_URL}/auth/me`;
    const backendRes = await fetch(backendUrl, {
      headers: { Cookie: cookieHeader },
    });

    if (!backendRes.ok) {
      return NextResponse.json({ isLoggedIn: false });
    }

    const data = await backendRes.json();
    return NextResponse.json({ ...data, isLoggedIn: true });
  } catch {
    return NextResponse.json(
      { isLoggedIn: false, error: "Session service unavailable" },
      { status: 503 },
    );
  }
}
