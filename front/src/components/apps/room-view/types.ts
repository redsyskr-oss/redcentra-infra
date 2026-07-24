import * as THREE from 'three';

/* ══════════════════════════════════════════════
   1. 타입 & 상수 정의
══════════════════════════════════════════════ */
export type RackStatus = 'ACTIVE' | 'MAINTENANCE' | 'CRITICAL';
export type ToolMode   = 'move'   | 'place'       | 'delete';

export interface PlacedRack {
  id: string;
  name: string;
  posX: number;
  posY: number;
  unitSize: number;
  status: RackStatus;
}

export interface LogicalPos {
  col: number;
  row: number;
}

export interface ApiRack {
  id: number;
  posX: number;
  posY: number;
  rackName: string;
  totalUnit: number;
}

export interface RoomApiResponse {
  id: number;
  roomName: string;
  gridWidth: number;
  gridHeight: number;
  floor: number;
}

export const STATUS_COLOR: Record<RackStatus, string> = {
  ACTIVE:      '#38bdf8',
  MAINTENANCE: '#f59e0b',
  CRITICAL:    '#fb7185',
};

/* ══════════════════════════════════════════════
   2. 좌표 변환 유틸
══════════════════════════════════════════════ */
export const logicalToWorld = (col: number, row: number, cols: number, rows: number) => ({
  x: col - (cols / 2 + 0.5),
  z: row - (rows / 2 + 0.5),
});

export const worldToLogical = (point: THREE.Vector3, cols: number, rows: number): LogicalPos | null => {
  const col = Math.round(point.x + cols / 2 + 0.5);
  const row = Math.round(point.z + rows / 2 + 0.5);
  if (col < 1 || col > cols || row < 1 || row > rows) return null;
  return { col, row };
};


/* ══════════════════════════════════════════════
   3-B. 랙 디바이스 타입
══════════════════════════════════════════════ */
export type DeviceType = 'server-1u' | 'server-2u' | 'switch' | 'patch' | 'empty';

export const RACK_UNIT_HEIGHT = 0.04;
export const EQUIPMENT_UNIT_GAP = 0.003;
// 바닥 타일 상단(약 0.0225) 위에 랙 하단 프레임이 놓이도록 최소 높이만 보정한다.
export const RACK_FLOOR_OFFSET = 0.024;

export interface RackDevice {
  id?: number;
  startU: number;
  height: number;
  name: string;
  type: DeviceType;
  modelName?: string;
  vendor?: string;
  equipmentType?: string;
  portCount?: 16 | 24 | 48;
  portLayout?: 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';
  frontColor?: string;
  backColor?: string;
  deviceTypeRaw?: string; // "SERVER" | "SWITCH" | "PDU" | ...
}

export interface MaintenanceTask {
  id: number;
  kind: 'FAULT' | 'WORK';
  title: string;
  content: string;
  deviceId: number | null;
  deviceName: string | null;
  occurredAt: string;
  assigneeName: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'DONE';
  actionNote?: string | null;
}

export interface ApiDevice {
  id: number;
  deviceName: string;
  deviceType: string;
  modelName: string;
  vendor?: string;
  productModelId?: number;
  equipmentType?: string;
  portCount?: 16 | 24 | 48;
  portLayout?: 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';
  uPosition: number;
  uSize: number;
  frontColor: string;
  backColor: string;
  status: string;
  companyId: number;
}

export interface ApiRackDetail {
  id: number;
  rackName: string;
  posX: number;
  posY: number;
  totalUnit: number;
  roomId: number;
  devices: ApiDevice[];
}

export interface ApiPort {
  id?: number;
  type: string;
  clientType: string;
  connectionAddress: string;
  deviceNetworkName: string;
  gateway?: string;
  subnetMask?: string;
}

export interface ApiCableLink {
  id?: number;
  cableType: string;
  color: string;
  memo: string;
  srcDeviceId: number;
  srcDeviceName?: string;
  srcPortName: string;
  destDeviceId: number;
  destDeviceName?: string;
  destPortName: string;
}

export interface ApiDeviceDetail {
  id: number;
  deviceName: string;
  deviceType: string;
  modelName: string;
  vendor?: string;
  productModelId?: number;
  equipmentType?: string;
  portCount?: 16 | 24 | 48;
  portLayout?: 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';
  cpuSocketCount?: number | null;
  coresPerSocket?: number | null;
  totalCoreCount?: number | null;
  memoryGb?: number | null;
  status: string;
  uPosition: number;
  uSize: number;
  frontColor: string;
  backColor: string;
  ports: ApiPort[];
  cableLinks: ApiCableLink[];
}

export interface ApiDeviceFlat extends ApiDevice {
  rackId: number | null;
  hostName?: string;
  serialNumber?: string;
  assetNo?: string;
  bizName?: string;
  ports?: ApiPort[];
}

export interface RackSearchResult {
  rack: PlacedRack;
  matchedDevices: ApiDeviceFlat[];
}

export interface ApiEnvSensor {
  id: number;
  label: string;
  roomName: string;
  tempC: number;
  humidityPercent: number;
}

export interface ApiSwLicense {
  id: number;
  swName: string;
  version: string;
  category: string;
  assignUnit?: 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';
  assignmentUnit?: 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';
  corePackSize?: number;
}

export interface ApiLicenseAssignment {
  id: number;
  licenseId: number;
  deviceId: number;
  assignedQty?: number;
  quantity?: number;
  coreCount?: number;
  licenseUnitQty?: number;
  appliedCoreCount?: number;
  revokedAt: string | null;
}

export interface ApiAllocatedLicense extends ApiSwLicense {
  assignedQty: number;
  licenseUnitQty: number;
}

/** 목업 환경센서는 방 이름 기준으로만 연결돼 있어("본관 1층 전산실" 등) 랙별 센서가 없다.
 * 방에 속한 센서 중 랙 순번으로 하나를 결정적으로 골라 "해당 랙의 온도"로 보여준다. */
export function normalizeRoomName(name: string): string {
  return name.replace(/\s+/g, '').replace('지하', '');
}

export interface ProductModelFaceplate {
  id: number;
  vendor: string;
  modelName: string;
  equipmentType?: string;
  portCount?: 16 | 24 | 48;
  portLayout?: 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';
  cpuSocketCount?: number | null;
  coresPerSocket?: number | null;
  totalCoreCount?: number | null;
  memoryGb?: number | null;
}

export interface FaceplatePortTemplate {
  productModelId: number;
  startIndex: number;
  endIndex: number;
  indexStep: number;
}

export function apiDeviceToRackDevice(d: ApiDevice, model?: ProductModelFaceplate): RackDevice {
  let type: DeviceType;
  if (d.deviceType === 'SWITCH' || /BACKBONE|CORE/i.test(d.deviceType)) type = 'switch';
  else if (d.deviceType === 'PDU')    type = 'patch';
  else if (d.uSize >= 2)              type = 'server-2u';
  else                                type = 'server-1u';

  return {
    id:            d.id,
    startU:        d.uPosition,
    height:        d.uSize,
    name:          d.deviceName,
    type,
    modelName:     d.modelName,
    vendor:        d.vendor ?? model?.vendor,
    equipmentType: d.equipmentType ?? model?.equipmentType,
    portCount:     d.portCount ?? model?.portCount,
    portLayout:    d.portLayout ?? model?.portLayout,
    frontColor:    d.frontColor,
    backColor:     d.backColor,
    deviceTypeRaw: d.deviceType,
  };
}

