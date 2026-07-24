import { NextRequest, NextResponse } from 'next/server';
import { fetchMock, isMockApi } from '@/lib/mock/jsonServerClient';

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
