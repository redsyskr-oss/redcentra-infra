import { NextRequest, NextResponse } from 'next/server';
import { fetchMock, isMockApi, MOCK_API_URL, postMock } from '@/lib/mock/jsonServerClient';

interface DeviceInput { deviceName: string; assetNo: string; deviceType: string; modelName?: string; hostName?: string; serialNumber?: string; introDate?: string; uPosition: number; uSize: number; status?: string; }
interface ExistingDevice extends DeviceInput { id: number; rackId: number | null; }
interface Rack { id: number; totalUnit: number; devices?: ExistingDevice[]; }

function validate(devices: DeviceInput[], rack: Rack, allDevices: ExistingDevice[]) {
  const errors: string[] = [];
  const occupied = allDevices.filter((device) => Number(device.rackId) === rack.id).map((device) => ({ start: device.uPosition, end: device.uPosition + device.uSize - 1, name: device.deviceName }));
  const existingAssets = new Set(allDevices.map((device) => device.assetNo).filter(Boolean));
  const existingNames = new Set(allDevices.map((device) => device.deviceName));
  const batchAssets = new Set<string>(); const batchNames = new Set<string>();
  devices.forEach((device, index) => {
    const row = index + 2; const end = device.uPosition + device.uSize - 1;
    if (!device.deviceName || !device.assetNo || !device.deviceType) errors.push(`${row}행: 필수값 누락`);
    if (!Number.isInteger(device.uPosition) || !Number.isInteger(device.uSize) || device.uPosition < 1 || device.uSize < 1 || end > rack.totalUnit) errors.push(`${row}행: U 범위 오류`);
    const collision = occupied.find((range) => device.uPosition <= range.end && end >= range.start); if (collision) errors.push(`${row}행: ${collision.name}과 U 위치 겹침`);
    if (existingAssets.has(device.assetNo) || batchAssets.has(device.assetNo)) errors.push(`${row}행: 자산번호 중복`);
    if (existingNames.has(device.deviceName) || batchNames.has(device.deviceName)) errors.push(`${row}행: 장비명 중복`);
    occupied.push({ start: device.uPosition, end, name: device.deviceName }); batchAssets.add(device.assetNo); batchNames.add(device.deviceName);
  });
  return errors;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ rackId: string }> }) {
  const { rackId: rawRackId } = await params; const rackId = Number(rawRackId); const payload = await request.json(); const devices = payload.devices as DeviceInput[];
  if (!Array.isArray(devices) || devices.length === 0) return NextResponse.json({ error: '등록할 장비가 없습니다.' }, { status: 400 });
  if (!isMockApi()) {
    const cookie = request.headers.get('cookie') ?? '';
    const res = await fetch(`${process.env.INTERNAL_BACKEND_URL}/racks/${rackId}/devices/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ devices }) });
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } });
  }
  const [rack, allDevices] = await Promise.all([fetchMock<Rack>(`/racks/${rackId}`), fetchMock<ExistingDevice[]>('/devices')]);
  if (!rack) return NextResponse.json({ error: '랙을 찾을 수 없습니다.' }, { status: 404 });
  const errors = validate(devices, rack, allDevices ?? []); if (errors.length) return NextResponse.json({ error: errors.join('\n'), errors }, { status: 400 });
  const created: ExistingDevice[] = [];
  try {
    for (const device of devices) {
      const row = await postMock<ExistingDevice>('/devices', { ...device, rackId, status: device.status || 'OPERATING', ports: [], cableLinks: [], companyId: 1 });
      if (!row) throw new Error('장비 생성 실패'); created.push(row);
    }
    await postMock('/auditLogs', { action: 'RACK_DEVICE_BULK_IMPORT', targetRackId: rackId, detail: `${created.length}건 엑셀 일괄 등록`, createdAt: new Date().toISOString() });
    return NextResponse.json({ success: true, count: created.length });
  } catch {
    await Promise.all(created.map((device) => fetch(`${MOCK_API_URL}/devices/${device.id}`, { method: 'DELETE' })));
    return NextResponse.json({ error: '일괄 등록 중 오류가 발생해 전체 작업을 취소했습니다.' }, { status: 500 });
  }
}
