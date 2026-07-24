import { NextRequest, NextResponse } from 'next/server';
import { fetchMock, isMockApi, patchMock } from '@/lib/mock/jsonServerClient';

interface Device {
  id: number;
  rackId: number | null;
  [key: string]: unknown;
}

interface Rack {
  id: number;
  roomId?: number;
  devices?: Device[];
  [key: string]: unknown;
}

interface Room {
  id: number;
  racks?: Rack[];
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

  const updated = await patchMock<Device>(`/devices/${deviceId}`, patch);
  if (!updated) return NextResponse.json({ error: '장비 배치 정보를 저장하지 못했습니다.' }, { status: 500 });

  const oldRackId = current.rackId;
  const newRackId = patch.rackId == null ? null : Number(patch.rackId);
  const affectedRackIds = [...new Set([oldRackId, newRackId].filter((id): id is number => id != null))];

  for (const rackId of affectedRackIds) {
    const rack = await fetchMock<Rack>(`/racks/${rackId}`);
    if (!rack) continue;
    const withoutDevice = (rack.devices ?? []).filter((device) => Number(device.id) !== deviceId);
    const devices = rackId === newRackId ? [...withoutDevice, updated] : withoutDevice;
    const updatedRack = await patchMock<Rack>(`/racks/${rackId}`, { devices });
    if (updatedRack?.roomId != null) {
      const room = await fetchMock<Room>(`/rooms/${updatedRack.roomId}`);
      if (room) {
        const roomRacks = (room.racks ?? []).map((item) => Number(item.id) === rackId ? updatedRack : item);
        await patchMock(`/rooms/${updatedRack.roomId}`, { racks: roomRacks });
      }
    }
  }

  return NextResponse.json(updated);
}
