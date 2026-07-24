import { NextRequest, NextResponse } from 'next/server';
import { fetchMock, isMockApi, patchMock } from '@/lib/mock/jsonServerClient';
import { parseMockToken } from '@/lib/mock/authService';
import { authorizeMockRequest, authzErrorResponse } from '@/lib/mock/accessControl';

interface Device {
  id: number;
  rackId: number | null;
  [key: string]: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId: rawDeviceId } = await params;
  const deviceId = Number(rawDeviceId);
  const patch = await request.json();

  if (!Number.isFinite(deviceId)) {
    return NextResponse.json({ error: '올바르지 않은 장비 ID입니다.' }, { status: 400 });
  }

  // 목업 모드에서는 이 전용 라우트가 [...path] 프록시보다 우선 매칭되므로 인증·인가를 직접 확인한다.
  if (isMockApi()) {
    const memberId = parseMockToken(request.headers.get('cookie') ?? '');
    if (memberId == null) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const authz = await authorizeMockRequest(memberId, 'devices', 'PATCH');
    if (!authz.ok) return NextResponse.json(authzErrorResponse(authz), { status: authz.status });
  }

  if (!isMockApi()) {
    const cookie = request.headers.get('cookie') ?? '';
    const response = await fetch(`${process.env.INTERNAL_BACKEND_URL}/devices/${deviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(patch),
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    });
  }

  const current = await fetchMock<Device>(`/devices/${deviceId}`);
  if (!current) return NextResponse.json({ error: '장비를 찾을 수 없습니다.' }, { status: 404 });

  // 장비 배치는 devices 컬렉션이 단일 소스다. 랙/룸에는 장비를 중첩 저장하지 않으므로
  // 별도 동기화가 필요 없다 (랙 상세는 GET /racks/[rackId]가 devices에서 조합).
  const updated = await patchMock<Device>(`/devices/${deviceId}`, patch);
  if (!updated) return NextResponse.json({ error: '장비 배치 정보를 저장하지 못했습니다.' }, { status: 500 });

  return NextResponse.json(updated);
}
