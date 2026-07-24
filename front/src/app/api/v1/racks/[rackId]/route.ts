import { NextRequest, NextResponse } from 'next/server';
import { fetchMock, isMockApi } from '@/lib/mock/jsonServerClient';
import { parseMockToken } from '@/lib/mock/authService';
import { authorizeMockRequest, authzErrorResponse } from '@/lib/mock/accessControl';

interface Device {
  id: number;
  rackId: number | null;
}

interface Rack {
  id: number;
  devices?: Device[];
  [key: string]: unknown;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rackId: string }> },
) {
  const { rackId: rawRackId } = await params;
  const rackId = Number(rawRackId);

  // 목업 모드에서는 이 전용 라우트가 [...path] 프록시보다 우선 매칭되므로 인증·인가를 직접 확인한다.
  if (isMockApi()) {
    const memberId = parseMockToken(request.headers.get('cookie') ?? '');
    if (memberId == null) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const authz = await authorizeMockRequest(memberId, 'racks', 'GET');
    if (!authz.ok) return NextResponse.json(authzErrorResponse(authz), { status: authz.status });
  }

  if (!isMockApi()) {
    const response = await fetch(`${process.env.INTERNAL_BACKEND_URL}/racks/${rackId}`, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    });
  }

  const [rack, devices] = await Promise.all([
    fetchMock<Rack>(`/racks/${rackId}`),
    fetchMock<Device[]>('/devices'),
  ]);
  if (!rack) return NextResponse.json({ error: '랙을 찾을 수 없습니다.' }, { status: 404 });

  return NextResponse.json({
    ...rack,
    devices: (devices ?? []).filter((device) => Number(device.rackId) === rackId),
  });
}
