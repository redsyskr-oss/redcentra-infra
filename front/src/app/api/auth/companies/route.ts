import { NextResponse } from "next/server";
import { isMockApi, fetchMock } from "@/lib/mock/jsonServerClient";

export async function GET() {
  if (isMockApi()) {
    const companies = (await fetchMock<{ id: number; companyName: string }[]>("/companies")) ?? [];
    return NextResponse.json({
      companies: companies.map((c) => ({ companyId: c.id, companyName: c.companyName })),
    });
  }

  try {
    const backendUrl = `${process.env.INTERNAL_BACKEND_URL}/auth/companies`;
    const backendRes = await fetch(backendUrl);
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json(
      { code: "SERVICE_UNAVAILABLE", message: "업체 목록을 불러오지 못했습니다." },
      { status: 503 },
    );
  }
}
