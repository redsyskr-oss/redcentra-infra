import { NextRequest, NextResponse } from "next/server";
import { isMockApi, fetchMock, postMock } from "@/lib/mock/jsonServerClient";

interface MockUserRow {
  id: number;
  userId: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (isMockApi()) {
    const { userId, password, userName, userMobile, userEmail, ...rest } = body;

    const existing = await fetchMock<MockUserRow[]>(`/users?userId=${encodeURIComponent(userId ?? "")}`);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { code: "DUPLICATE_USER_ID", message: "이미 사용 중인 아이디입니다." },
        { status: 409 },
      );
    }

    const allUsers = (await fetchMock<MockUserRow[]>("/users")) ?? [];
    const nextId = allUsers.reduce((max, u) => Math.max(max, u.id), 0) + 1;

    const created = await postMock("/users", {
      id: nextId,
      userId,
      userPassword: password,
      name: userName,
      email: userEmail,
      mobile: userMobile,
      role: rest.companyId || rest.requestedCompanyName ? "PARTNER" : "USER",
      status: "PENDING",
      department: rest.department ?? rest.requestedCompanyName ?? null,
      employeeNumber: rest.employeeNumber ?? null,
      position: rest.position ?? null,
      extensionNumber: rest.extensionNumber ?? null,
      companyId: rest.companyId ?? null,
      applyReason: rest.applyReason ?? null,
      requestedCompanyName: rest.requestedCompanyName ?? null,
      requestedBusinessNumber: rest.requestedBusinessNumber ?? null,
      requestedCompanyPhone: rest.requestedCompanyPhone ?? null,
      defaultMenu: null,
      createdAt: new Date().toISOString(),
    });

    if (!created) {
      return NextResponse.json(
        { code: "SERVICE_UNAVAILABLE", message: "가입 신청 처리 중 오류가 발생했습니다." },
        { status: 503 },
      );
    }

    await postMock("/userApprovals", {
      id: Date.now(),
      targetUserId: nextId,
      requestType: "USER_REGISTRATION",
      requestReason: rest.applyReason ?? "",
      status: "PENDING",
      approverId: null,
      processComment: null,
      processedAt: null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: "가입 신청이 완료되었습니다." });
  }

  try {
    const backendUrl = `${process.env.INTERNAL_BACKEND_URL}/auth/join`;
    const backendRes = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { code: "SERVICE_UNAVAILABLE", message: "가입 신청 처리 중 오류가 발생했습니다." },
      { status: 503 },
    );
  }
}
