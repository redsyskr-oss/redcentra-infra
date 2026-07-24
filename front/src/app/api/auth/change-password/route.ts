import { NextRequest, NextResponse } from 'next/server';
import { isMockApi, fetchMock, patchMock, postMock } from '@/lib/mock/jsonServerClient';
import { parseMockToken } from '@/lib/mock/authService';

interface MockUser { id: number; userPassword: string; }

export async function POST(request: NextRequest) {
  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword || newPassword.length < 10) {
    return NextResponse.json({ error: '새 비밀번호는 10자 이상이어야 합니다.' }, { status: 400 });
  }
  const cookie = request.headers.get('cookie') ?? '';
  if (isMockApi()) {
    const memberId = parseMockToken(cookie);
    if (!memberId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const user = await fetchMock<MockUser>(`/users/${memberId}`);
    if (!user || user.userPassword !== currentPassword) return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
    await patchMock(`/users/${memberId}`, { userPassword: newPassword, mustChangePassword: false, passwordChangedAt: new Date().toISOString() });
    await postMock('/auditLogs', { memberId, action: 'PASSWORD_CHANGE', detail: '사용자 비밀번호 변경', createdAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  }
  const res = await fetch(`${process.env.INTERNAL_BACKEND_URL}/auth/password/change`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ currentPassword, newPassword }) });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
