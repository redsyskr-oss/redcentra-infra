import { NextRequest, NextResponse } from "next/server";
import { isMockApi, fetchMock, postMock } from "@/lib/mock/jsonServerClient";

interface MockUserRow {
  id: number;
  userId: string;
}

/** 비밀번호 정책: change-password와 동일 (10자 이상, 영문·숫자·특수문자 포함) */
function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (isMockApi()) {
    const { userId, password, userName, userMobile, userEmail, ...rest } = body;

    if (!userId || !userName) {
      return NextResponse.json(
        { code: "INVALID_REQUEST", message: "아이디와 이름은 필수입니다." },
        { status: 400 },
      );
    }
    const pwError = passwordPolicyError(password);
    if (pwError) {
      return NextResponse.json({ code: "INVALID_PASSWORD", message: pwError }, { status: 400 });
    }

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
