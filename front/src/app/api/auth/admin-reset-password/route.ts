import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isMockApi, fetchMock, patchMock, postMock } from '@/lib/mock/jsonServerClient';
import { getUserInfo, parseMockToken } from '@/lib/mock/authService';

function temporaryPassword() {
  return `R!${randomBytes(8).toString('base64url')}9a`;
}

export async function POST(request: NextRequest) {
  const { targetUserId } = await request.json();
  const cookie = request.headers.get('cookie') ?? '';
  if (isMockApi()) {
    const adminId = parseMockToken(cookie);
    const admin = adminId ? await getUserInfo(adminId) : null;
    if (!admin?.roles.includes('ROLE_SYSTEM_ADMIN')) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    const target = await fetchMock<{ id: number }>(`/users/${Number(targetUserId)}`);
    if (!target) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    const password = temporaryPassword();
    await patchMock(`/users/${target.id}`, { userPassword: password, mustChangePassword: true, passwordResetAt: new Date().toISOString() });
    await postMock('/auditLogs', { memberId: adminId, targetUserId: target.id, action: 'PASSWORD_ADMIN_RESET', detail: '관리자 임시 비밀번호 발급', createdAt: new Date().toISOString() });
    return NextResponse.json({ temporaryPassword: password });
  }
  const res = await fetch(`${process.env.INTERNAL_BACKEND_URL}/auth/password/admin-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ targetUserId }) });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
