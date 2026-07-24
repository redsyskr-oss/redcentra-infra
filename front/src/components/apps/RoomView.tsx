'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Text, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { AlertTriangle, Server, Move, PackagePlus, Trash2, Loader2, X, Search, Thermometer, ArrowUpRightFromSquare, KeyRound } from 'lucide-react';
import { equipmentFaceplateDataUrl, type EquipmentFaceSide } from '@/lib/equipment-faceplate';
import { apiFetch } from '@/lib/api';

/* ══════════════════════════════════════════════
   1. 타입 & 상수 정의
══════════════════════════════════════════════ */
type RackStatus = 'ACTIVE' | 'MAINTENANCE' | 'CRITICAL';
type ToolMode   = 'move'   | 'place'       | 'delete';

interface PlacedRack {
  id: string;
  name: string;
  posX: number;
  posY: number;
  unitSize: number;
  status: RackStatus;
}

interface LogicalPos {
  col: number;
  row: number;
}

interface ApiRack {
  id: number;
  posX: number;
  posY: number;
  rackName: string;
  totalUnit: number;
}

interface RoomApiResponse {
  id: number;
  roomName: string;
  gridWidth: number;
  gridHeight: number;
  floor: number;
  racks: ApiRack[];
}

const STATUS_COLOR: Record<RackStatus, string> = {
  ACTIVE:      '#38bdf8',
  MAINTENANCE: '#f59e0b',
  CRITICAL:    '#fb7185',
};

/* ══════════════════════════════════════════════
   2. 좌표 변환 유틸
══════════════════════════════════════════════ */
const logicalToWorld = (col: number, row: number, cols: number, rows: number) => ({
  x: col - (cols / 2 + 0.5),
  z: row - (rows / 2 + 0.5),
});

const worldToLogical = (point: THREE.Vector3, cols: number, rows: number): LogicalPos | null => {
  const col = Math.round(point.x + cols / 2 + 0.5);
  const row = Math.round(point.z + rows / 2 + 0.5);
  if (col < 1 || col > cols || row < 1 || row > rows) return null;
  return { col, row };
};


/* ══════════════════════════════════════════════
   3-B. 랙 디바이스 타입
══════════════════════════════════════════════ */
type DeviceType = 'server-1u' | 'server-2u' | 'switch' | 'patch' | 'empty';

const RACK_UNIT_HEIGHT = 0.04;
const EQUIPMENT_UNIT_GAP = 0.003;
// 바닥 타일 상단(약 0.0225) 위에 랙 하단 프레임이 놓이도록 최소 높이만 보정한다.
const RACK_FLOOR_OFFSET = 0.024;

interface RackDevice {
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

interface MaintenanceTask {
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

interface ApiDevice {
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

interface ApiRackDetail {
  id: number;
  rackName: string;
  posX: number;
  posY: number;
  totalUnit: number;
  roomId: number;
  devices: ApiDevice[];
}

interface ApiPort {
  id?: number;
  type: string;
  clientType: string;
  connectionAddress: string;
  deviceNetworkName: string;
  gateway?: string;
  subnetMask?: string;
}

interface ApiCableLink {
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

interface ApiDeviceDetail {
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

interface ApiDeviceFlat extends ApiDevice {
  rackId: number | null;
  hostName?: string;
  serialNumber?: string;
  assetNo?: string;
  bizName?: string;
  ports?: ApiPort[];
}

interface RackSearchResult {
  rack: PlacedRack;
  matchedDevices: ApiDeviceFlat[];
}

interface ApiEnvSensor {
  id: number;
  label: string;
  roomName: string;
  tempC: number;
  humidityPercent: number;
}

interface ApiSwLicense {
  id: number;
  swName: string;
  version: string;
  category: string;
  assignUnit?: 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';
  assignmentUnit?: 'NODE' | 'AGENT' | 'PROCESSOR' | 'CORE';
  corePackSize?: number;
}

interface ApiLicenseAssignment {
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

interface ApiAllocatedLicense extends ApiSwLicense {
  assignedQty: number;
  licenseUnitQty: number;
}

/** 목업 환경센서는 방 이름 기준으로만 연결돼 있어("본관 1층 전산실" 등) 랙별 센서가 없다.
 * 방에 속한 센서 중 랙 순번으로 하나를 결정적으로 골라 "해당 랙의 온도"로 보여준다. */
function normalizeRoomName(name: string): string {
  return name.replace(/\s+/g, '').replace('지하', '');
}

interface ProductModelFaceplate {
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

interface FaceplatePortTemplate {
  productModelId: number;
  startIndex: number;
  endIndex: number;
  indexStep: number;
}

function apiDeviceToRackDevice(d: ApiDevice, model?: ProductModelFaceplate): RackDevice {
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

const DEVICE_STYLE: Record<DeviceType, { bg: string; border: string; text: string; label: string }> = {
  'server-1u': { bg: '#0c2040', border: '#3b82f6', text: '#93c5fd', label: '1U 서버'   },
  'server-2u': { bg: '#0c2040', border: '#60a5fa', text: '#bfdbfe', label: '2U 서버'   },
  'switch':    { bg: '#062014', border: '#22c55e', text: '#86efac', label: '스위치'     },
  'patch':     { bg: '#1c1208', border: '#f59e0b', text: '#fcd34d', label: '패치패널'   },
  'empty':     { bg: '#0a0a0a', border: '#1f2937', text: '#374151', label: ''           },
};

/** 랙 ID 기반 시드 난수로 재현 가능한 장비 배치 생성 */
function generateRackDevices(rackId: string, totalU: number): RackDevice[] {
  let seed = rackId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const devices: RackDevice[] = [];
  let u = 1;
  while (u <= totalU) {
    const remaining = totalU - u + 1;
    const r = rand();
    if (r < 0.10) {
      devices.push({ startU: u, height: 1, name: '', type: 'empty' });
      u += 1;
    } else if (r < 0.27) {
      devices.push({ startU: u, height: 1, name: `PP-${String(u).padStart(2, '0')}`, type: 'patch' });
      u += 1;
    } else if (r < 0.44) {
      devices.push({ startU: u, height: 1, name: `SW-${String(u).padStart(2, '0')}`, type: 'switch' });
      u += 1;
    } else if (r < 0.72) {
      devices.push({ startU: u, height: 1, name: `SRV-${String(u).padStart(2, '0')}`, type: 'server-1u' });
      u += 1;
    } else if (remaining >= 2) {
      devices.push({ startU: u, height: 2, name: `SRV-${String(u).padStart(2, '0')}`, type: 'server-2u' });
      u += 2;
    } else {
      devices.push({ startU: u, height: 1, name: '', type: 'empty' });
      u += 1;
    }
  }
  return devices;
}

const U_PX = 20; // 1U당 픽셀 높이

/* ══════════════════════════════════════════════
   4-A-1. EquipmentMesh — 랙 내부 장비 3D 메쉬
   선택된 랙에서 와이어프레임 사이드를 통해 보임
══════════════════════════════════════════════ */
const EQUIP_3D: Record<Exclude<DeviceType, 'empty'>, {
  body: string; front: string; emissive: string; led: string;
}> = {
  'server-1u': { body: '#060e1c', front: '#0e2147', emissive: '#0d2060', led: '#3b82f6' },
  'server-2u': { body: '#060e1c', front: '#0e2147', emissive: '#0d2060', led: '#60a5fa' },
  'switch':    { body: '#050e06', front: '#092010', emissive: '#071a0a', led: '#22c55e' },
  'patch':     { body: '#100900', front: '#231500', emissive: '#1c1000', led: '#f59e0b' },
};

const DEVICE_TYPE_LABEL: Record<Exclude<DeviceType, 'empty'>, string> = {
  'server-1u': 'SERVER 1U',
  'server-2u': 'SERVER 2U',
  'switch':    'SWITCH',
  'patch':     'PATCH',
};

function compactRackLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

interface EquipmentMeshProps {
  device: RackDevice;
  rackW: number;
  rackD: number;
  isSelected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  dashboardLabel?: boolean;
  alarmed?: boolean;
}

function EquipmentFaceplate({ device, width, height, depth, side }: { device: RackDevice; width: number; height: number; depth: number; side: EquipmentFaceSide }) {
  const url = useMemo(() => equipmentFaceplateDataUrl({
    vendor: device.vendor,
    modelName: device.modelName,
    deviceName: device.name,
    deviceType: device.deviceTypeRaw ?? device.type,
    equipmentType: device.equipmentType,
    portCount: device.portCount,
    portLayout: device.portLayout,
    side,
    animated: false,
  }), [device.vendor, device.modelName, device.name, device.deviceTypeRaw, device.type, device.equipmentType, device.portCount, device.portLayout, side]);
  const loadedTexture = useLoader(THREE.TextureLoader, url);
  const texture = useMemo(() => {
    const nextTexture = loadedTexture.clone();
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.anisotropy = 16;
    nextTexture.magFilter = THREE.LinearFilter;
    nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
    nextTexture.generateMipmaps = true;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [loadedTexture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh
      position={[0, 0, side === 'front' ? depth / 2 + 0.006 : -depth / 2 - 0.006]}
      rotation={side === 'front' ? [0, 0, 0] : [0, Math.PI, 0]}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function AlarmPulse({ width, height, z }: { width: number; height: number; z: number }) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const maskRef = useRef<THREE.MeshBasicMaterial>(null);
  const iconRef = useRef<THREE.MeshBasicMaterial>(null);
  const iconSize = Math.min(0.015, Math.max(0.007, height * 0.2));
  useFrame(({ clock }) => {
    const wave = (Math.sin(clock.elapsedTime * 2.4) + 1) / 2;
    if (materialRef.current) materialRef.current.emissiveIntensity = 0.9 + wave * 0.8;
    if (materialRef.current) materialRef.current.opacity = 0.68 + wave * 0.3;
    if (maskRef.current) maskRef.current.opacity = 0.08 + wave * 0.16;
    if (iconRef.current) iconRef.current.opacity = 0.62 + wave * 0.38;
  });
  return (
    <group>
      <mesh position={[0, 0, z - 0.002]}>
        <boxGeometry args={[Math.max(0.02, width - 0.018), Math.max(0.014, height - 0.018), 0.002]} />
        <meshBasicMaterial ref={maskRef} color="#ef4444" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh position={[width / 2 - 0.007, 0, z]}>
        <boxGeometry args={[0.014, Math.max(0.018, height - 0.008), 0.007]} />
        <meshStandardMaterial ref={materialRef} color="#f87171" emissive="#ef4444" emissiveIntensity={1.15} roughness={0.3} transparent opacity={0.9} />
      </mesh>
      <mesh position={[width / 2 - 0.034, 0, z + 0.005]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[iconSize, 3]} />
        <meshBasicMaterial ref={iconRef} color="#f87171" transparent opacity={0.9} />
      </mesh>
      <Text position={[width / 2 - 0.034, -iconSize * 0.13, z + 0.009]} fontSize={iconSize * 1.05} color="#fff7ed" anchorX="center" anchorY="middle" fontWeight="bold">!</Text>
    </group>
  );
}

function BlinkingRackName({ name, position, fontSize }: { name: string; position: [number, number, number]; fontSize: number }) {
  const glowRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (glowRef.current) glowRef.current.emissiveIntensity = 0.85 + (Math.sin(clock.elapsedTime * 2.4) + 1) * 0.4;
  });
  return (
    <group position={position}>
      <Text fontSize={fontSize} color="#fca5a5" anchorX="center" anchorY="bottom" fontWeight="bold" outlineWidth={0.003} outlineColor="#450a0a">
        {name}
      </Text>
      <mesh position={[-fontSize * 0.88, fontSize * 0.5, 0.008]}>
        <circleGeometry args={[fontSize * 0.075, 24]} />
        <meshStandardMaterial ref={glowRef} color="#f87171" emissive="#ef4444" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0, -fontSize * 0.08, 0.006]}>
        <boxGeometry args={[fontSize * Math.min(3.2, Math.max(1.5, name.length * 0.42)), fontSize * 0.025, 0.004]} />
        <meshStandardMaterial color="#b91c1c" emissive="#ef4444" emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

function EquipmentMesh({ device, rackW, rackD, isSelected, onClick, dashboardLabel = false, alarmed = false }: EquipmentMeshProps) {
  const [hovered, setHovered] = useState(false);
  if (device.type === 'empty') return null;

  const s          = EQUIP_3D[device.type as Exclude<DeviceType, 'empty'>];
  const bodyColor  = device.backColor  ?? s.body;
  const frontColor = device.frontColor ?? s.front;
  const accentColor = device.frontColor ?? s.led;

  const safeStartU = Math.max(1, Math.round(device.startU));
  const safeHeight = Math.max(1, Math.round(device.height));
  const bodyH = safeHeight * RACK_UNIT_HEIGHT - EQUIPMENT_UNIT_GAP;
  const bodyW = rackW - 0.13;
  const bodyD = rackD - 0.18;
  // U1의 바닥을 0으로 고정하고 장비를 해당 U 구간의 정확한 중앙에 배치한다.
  const yC = (safeStartU - 1) * RACK_UNIT_HEIGHT
    + safeHeight * RACK_UNIT_HEIGHT / 2;

  const emissiveInt = isSelected ? 1.2 : hovered ? 0.85 : 0.5;
  const ledColor    = isSelected ? '#ffffff' : accentColor;

  const typeLabel = compactRackLabel(
    device.deviceTypeRaw ?? DEVICE_TYPE_LABEL[device.type as Exclude<DeviceType, 'empty'>],
    11,
  );
  const deviceLabel = compactRackLabel(device.name, 16);
  const typeFontSize = Math.min(Math.max(0.014, bodyH * 0.34), 0.2 / Math.max(typeLabel.length, 5));
  const primaryLabel = dashboardLabel ? deviceLabel : typeLabel;
  const primaryFontSize = dashboardLabel
    ? Math.min(Math.max(0.019, bodyH * 0.48), 0.34 / Math.max(primaryLabel.length, 7))
    : typeFontSize;

  return (
    <group
      position={[0, yC, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(e); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      {/* 본체 */}
      <mesh>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial
          color={bodyColor}
          roughness={0.55}
          metalness={0.5}
        />
      </mesh>

      {/* 전면 패널 */}
      <mesh position={[0, 0, bodyD / 2 + 0.001]}>
        <boxGeometry args={[bodyW, bodyH, 0.007]} />
        <meshStandardMaterial
          color={frontColor}
          emissive={alarmed ? '#7f1d1d' : device.frontColor ?? s.emissive}
          emissiveIntensity={alarmed ? 0.28 : dashboardLabel ? Math.max(0.9, emissiveInt) : emissiveInt}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      <EquipmentFaceplate device={device} width={bodyW - 0.012} height={bodyH - 0.006} depth={bodyD} side="front" />
      <EquipmentFaceplate device={device} width={bodyW - 0.012} height={bodyH - 0.006} depth={bodyD} side="rear" />

      {/* 호버/선택 외곽선 */}
      {(hovered || isSelected) && (
        <mesh position={[0, 0, bodyD / 2 + 0.002]}>
          <boxGeometry args={[bodyW + 0.005, bodyH + 0.005, 0.001]} />
          <meshBasicMaterial color={isSelected ? '#ffffff' : accentColor} transparent opacity={0.6} />
        </mesh>
      )}

      {alarmed && (
        <>
          <AlarmPulse width={bodyW + 0.018} height={bodyH + 0.018} z={bodyD / 2 + 0.014} />
          <group rotation={[0, Math.PI, 0]}>
            <AlarmPulse width={bodyW + 0.018} height={bodyH + 0.018} z={bodyD / 2 + 0.014} />
          </group>
        </>
      )}

      {/* LED */}
      <mesh position={[-bodyW / 2 + 0.03, 0, bodyD / 2 + 0.006]}>
        <boxGeometry args={[0.009, 0.009, 0.003]} />
        <meshBasicMaterial color={ledColor} />
      </mesh>

      <Text
        position={[-bodyW / 2 + 0.055, 0, bodyD / 2 + 0.01]}
        fontSize={primaryFontSize}
        color={dashboardLabel ? '#ffffff' : isSelected ? '#ffffff' : accentColor}
        anchorX="left"
        anchorY="middle"
        fontWeight="bold"
        maxWidth={dashboardLabel ? bodyW * 0.82 : bodyW * 0.7}
        overflowWrap="normal"
      >
        {primaryLabel}
      </Text>

      {!dashboardLabel && device.height >= 2 && (
        <Text
          position={[-bodyW / 2 + 0.055, -bodyH * 0.22, bodyD / 2 + 0.01]}
          fontSize={deviceLabel.length > 12 ? 0.011 : 0.014}
          color={s.led + 'bb'}
          anchorX="left"
          anchorY="middle"
          maxWidth={bodyW * 0.72}
          overflowWrap="normal"
        >
          {deviceLabel}
        </Text>
      )}

      {/* 환기구 슬릿 */}
      {Array.from({ length: device.height * 3 }, (_, i) => (
        <mesh key={i} position={[0, -bodyH / 2 + (i + 0.5) * (bodyH / (device.height * 3)), -bodyD / 2 + 0.01]}>
          <boxGeometry args={[bodyW * 0.7, 0.002, 0.003]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
      ))}
    </group>
  );
}

/* ══════════════════════════════════════════════
   4-A. RackModel — HTML 스타일 상세 랙
   수직 기둥 4개 + 상하 프레임 + 사이드 메시 패널
   + 전면 글래스 도어 + 내부 레일 + LED 상태 표시
══════════════════════════════════════════════ */
interface RackModelProps {
  rack: PlacedRack;
  cols: number;
  rows: number;
  devices: RackDevice[];
  isSelected: boolean;
  isDeleteMode: boolean;
  tempC: number | null;
  onClick: () => void;
  selectedDeviceStartU: number | null;
  onDeviceClick: (device: RackDevice) => void;
  hideWireframe?: boolean;
  activeFaultDeviceIds: Set<number>;
}

function RackModel({ rack, cols, rows, devices, isSelected, isDeleteMode, tempC, onClick, selectedDeviceStartU, onDeviceClick, hideWireframe = false, activeFaultDeviceIds }: RackModelProps) {
  const [hovered, setHovered] = useState(false);
  const H  = rack.unitSize * RACK_UNIT_HEIGHT; // 42U → 1.68
  const W  = 0.82;
  const D  = 0.82;
  const FT = 0.025; // 프레임 두께

  const { x, z } = logicalToWorld(rack.posX, rack.posY, cols, rows);
  const rackHasFault = devices.some((device) => device.id != null && activeFaultDeviceIds.has(device.id));

  const frameColor =
    isDeleteMode && hovered ? '#ef4444' :
    isSelected              ? '#3b82f6' : '#1e1e1e';
  const emissive = isSelected ? '#1d3a7a' : '#000000';

  if (hideWireframe) {
    return (
      <group
        position={[x, RACK_FLOOR_OFFSET, z]}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {/* 장비 클릭을 가로채지 않도록 랙 선택 면은 장비 뒤쪽에 둔다. */}
        <mesh position={[0, H / 2, -D / 2 + 0.002]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {devices.map(device => (
          <EquipmentMesh
            key={`${device.id ?? device.startU}-${device.startU}`}
            device={device}
            rackW={W}
            rackD={D}
            isSelected={selectedDeviceStartU === device.startU}
            onClick={() => onDeviceClick(device)}
            dashboardLabel
            alarmed={device.id != null && activeFaultDeviceIds.has(device.id)}
          />
        ))}
        {rackHasFault ? (
          <BlinkingRackName name={rack.name} position={[0, H + 0.14, 0]} fontSize={0.1} />
        ) : (
          <Text position={[0, H + 0.14, 0]} fontSize={0.1} color={isSelected || hovered ? '#ffffff' : '#7dd3fc'} anchorX="center" anchorY="bottom" fontWeight="bold">
            {rack.name}
          </Text>
        )}
        <Text
          position={[0, H + 0.04, 0]}
          fontSize={0.075}
          color={tempC == null ? '#94a3b8' : tempColorFor(tempC)}
          anchorX="center"
          anchorY="bottom"
          fontWeight="bold"
        >
          {tempC == null ? '온도 -' : `${tempC.toFixed(1)}°C`}
        </Text>
      </group>
    );
  }

  const posts: [number, number][] = [
    [ W / 2,  D / 2],
    [-W / 2,  D / 2],
    [ W / 2, -D / 2],
    [-W / 2, -D / 2],
  ];

  return (
    <group
      position={[x, RACK_FLOOR_OFFSET, z]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={()  => setHovered(false)}
    >
      {/* ── 수직 기둥 4개 ── */}
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, H / 2, pz]} castShadow>
          <boxGeometry args={[FT, H, FT]} />
          <meshStandardMaterial color={frameColor} emissive={emissive} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* ── 상단 가로 프레임 (전/후/좌/우) ── */}
      <mesh position={[0, H,  D / 2]}>
        <boxGeometry args={[W + FT, FT, FT]} />
        <meshStandardMaterial color={frameColor} emissive={emissive} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, H, -D / 2]}>
        <boxGeometry args={[W + FT, FT, FT]} />
        <meshStandardMaterial color={frameColor} emissive={emissive} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[ W / 2, H, 0]}>
        <boxGeometry args={[FT, FT, D + FT]} />
        <meshStandardMaterial color={frameColor} emissive={emissive} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-W / 2, H, 0]}>
        <boxGeometry args={[FT, FT, D + FT]} />
        <meshStandardMaterial color={frameColor} emissive={emissive} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* ── 하단 프레임 (전/후) ── */}
      <mesh position={[0, FT / 2,  D / 2]}>
        <boxGeometry args={[W + FT, FT, FT]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, FT / 2, -D / 2]}>
        <boxGeometry args={[W + FT, FT, FT]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* ── 사이드 메시 패널 (와이어프레임) ── */}
      {!hideWireframe && <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial
          color="#555555"
          wireframe
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>}
      {!hideWireframe && <mesh position={[W / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial
          color="#555555"
          wireframe
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>}

      {/* ── 전면 글래스 도어 ── */}
      {!isSelected && <mesh position={[0, H / 2, D / 2 + 0.001]} raycast={() => null}>
        <planeGeometry args={[W - FT, H - FT]} />
        <meshStandardMaterial
          color={isSelected ? '#aaccff' : '#88aaff'}
          transparent
          opacity={isSelected ? 0.12 : 0.07}
          side={THREE.DoubleSide}
        />
      </mesh>}

      {/* ── 선택 시: 전면 U 구분선 ── */}
      {isSelected && Array.from({ length: rack.unitSize + 1 }, (_, i) => (
        !devices.some((device) => i + 1 >= device.startU && i + 1 < device.startU + device.height) &&
        <mesh key={`div-${i}`} position={[0, i * RACK_UNIT_HEIGHT, D / 2 + 0.003]} raycast={() => null}>
          <boxGeometry args={[W - FT * 2, 0.002, 0.001]} />
          <meshBasicMaterial color="#2a2a2a" />
        </mesh>
      ))}

      {/* ── 선택 시: 좌측 U 번호 텍스트 ── */}
      {!isSelected && Array.from({ length: rack.unitSize }, (_, i) => (
        (i % 5 === 0 || i === rack.unitSize - 1) && (
          <Text
            key={`ulabel-${i}`}
            position={[-W / 2 - 0.09, i * RACK_UNIT_HEIGHT + RACK_UNIT_HEIGHT / 2, D / 2]}
            fontSize={0.036}
            color="#7dd3fc"
            anchorX="right"
            anchorY="middle"
            fontWeight="bold"
          >
            {`${i + 1}U`}
          </Text>
        )
      ))}

      {/* ── 선택 시: 전면 마운팅 홀 (좌/우 레일) ── */}
      {isSelected && Array.from({ length: rack.unitSize }, (_, i) => (
        <group key={`hole-${i}`} position={[0, i * RACK_UNIT_HEIGHT + RACK_UNIT_HEIGHT / 2, D / 2 + 0.004]}>
          <mesh position={[-(W / 2 - FT - 0.016), 0, 0]} raycast={() => null}>
            <boxGeometry args={[0.008, 0.013, 0.002]} />
            <meshBasicMaterial color="#0a0a0a" />
          </mesh>
          <mesh position={[W / 2 - FT - 0.016, 0, 0]} raycast={() => null}>
            <boxGeometry args={[0.008, 0.013, 0.002]} />
            <meshBasicMaterial color="#0a0a0a" />
          </mesh>
        </group>
      ))}

      {/* ── 내부 장비 ── */}
      {devices.map(device => (
        <EquipmentMesh
          key={device.startU}
          device={device}
          rackW={W}
          rackD={D}
          isSelected={selectedDeviceStartU === device.startU}
          onClick={() => onDeviceClick(device)}
          dashboardLabel={isSelected}
          alarmed={device.id != null && activeFaultDeviceIds.has(device.id)}
        />
      ))}

      {/* ── 내부 레일 (좌/우) ── */}
      {!isSelected && <mesh position={[-W / 2 + 0.04, H / 2, D / 2 - 0.08]}>
        <boxGeometry args={[0.012, H * 0.95, 0.012]} />
        <meshStandardMaterial color="#555555" metalness={0.9} roughness={0.2} />
      </mesh>}
      {!isSelected && <mesh position={[W / 2 - 0.04, H / 2, D / 2 - 0.08]}>
        <boxGeometry args={[0.012, H * 0.95, 0.012]} />
        <meshStandardMaterial color="#555555" metalness={0.9} roughness={0.2} />
      </mesh>}

      {/* ── 상단 캡 + 절제된 상태 표시등 ── */}
      <mesh position={[0, H + 0.03, 0]}>
        <boxGeometry args={[W, 0.04, D]} />
        <meshStandardMaterial
          color="#172033"
          metalness={0.75}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, H + 0.052, D / 2 + 0.002]}>
        <boxGeometry args={[W * 0.72, 0.012, 0.008]} />
        <meshStandardMaterial
          color={STATUS_COLOR[rack.status]}
          emissive={STATUS_COLOR[rack.status]}
          emissiveIntensity={isSelected ? 0.55 : 0.18}
          metalness={0.25}
          roughness={0.38}
        />
      </mesh>

      {/* ── 온도 (랙 최상단) ── */}
      {tempC != null && (
        <Text
          position={[0, H + 0.48, 0]}
          fontSize={0.16}
          color={tempColorFor(tempC)}
          anchorY="bottom"
          fontWeight="bold"
        >
          {`${tempC}℃`}
        </Text>
      )}

      {/* ── 랙 이름 ── */}
      <Text
        position={[0, H + 0.25, 0]}
        fontSize={0.2}
        color="#ffffff"
        anchorY="bottom"
        fontWeight="bold"
      >
        {rack.name}
      </Text>
    </group>
  );
}

function tempColorFor(tempC: number): string {
  return tempC >= 28 ? '#f87171' : tempC >= 25 ? '#fbbf24' : '#34d399';
}

/* ══════════════════════════════════════════════
   4-B. GhostRack — 배치 미리보기
══════════════════════════════════════════════ */
function GhostRack({ col, row, cols, rows }: LogicalPos & { cols: number; rows: number }) {
  const H = 1.68;
  const { x, z } = logicalToWorld(col, row, cols, rows);
  return (
    <mesh position={[x, H / 2, z]}>
      <boxGeometry args={[0.82, H, 0.82]} />
      <meshBasicMaterial color="#22c55e" wireframe />
    </mesh>
  );
}

/* ══════════════════════════════════════════════
   4-C. FloorBoard — 메탈 데이터센터 바닥 타일
   브러시드 스틸 재질 + 가시성 높은 좌표 라벨
══════════════════════════════════════════════ */
function FloorBoard({ cols, rows }: { cols: number; rows: number }) {
  const tiles = useMemo(() => {
    const result: { key: string; x: number; z: number; label: string }[] = [];
    for (let c = 1; c <= cols; c++) {
      for (let r = 1; r <= rows; r++) {
        const { x, z } = logicalToWorld(c, r, cols, rows);
        result.push({ key: `${c}-${r}`, x, z, label: `${c}-${r}` });
      }
    }
    return result;
  }, [cols, rows]);

  return (
    <group>
      {/* 기반 바닥 — 줄눈 색 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[cols + 4, rows + 4]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
      </mesh>

      {/* 흰색 타일 */}
      {tiles.map(({ key, x, z, label }) => (
        <group key={key} position={[x, 0, z]}>
          {/* 타일 본체 */}
          <mesh receiveShadow castShadow>
            <boxGeometry args={[0.96, 0.045, 0.96]} />
            <meshStandardMaterial
              color="#f8fafc"
              roughness={0.25}
              metalness={0.05}
            />
          </mesh>

          {/* 좌표 라벨 */}
          <Text
            position={[0, 0.05, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.16}
            color="#1e293b"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {label}
          </Text>
        </group>
      ))}
    </group>
  );
}

/* ══════════════════════════════════════════════
   4-D. Toolbar — 다크 테마
══════════════════════════════════════════════ */
interface ToolbarProps {
  toolMode: ToolMode;
  onChangeTool: (mode: ToolMode) => void;
  faceSide: EquipmentFaceSide;
  onChangeFaceSide: (side: EquipmentFaceSide) => void;
}

function Toolbar({ toolMode, onChangeTool, faceSide, onChangeFaceSide }: ToolbarProps) {
  const tools: { mode: ToolMode; label: string; icon: React.ReactNode; active: string }[] = [
    { mode: 'move',   label: '이동', icon: <Move size={18} />,        active: 'bg-blue-500/20 text-blue-400 border-blue-500/40'   },
    { mode: 'place',  label: '추가', icon: <PackagePlus size={18} />, active: 'bg-green-500/20 text-green-400 border-green-500/40' },
    { mode: 'delete', label: '삭제', icon: <Trash2 size={18} />,      active: 'bg-red-500/20 text-red-400 border-red-500/40'       },
  ];

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 bg-black/70 backdrop-blur border border-slate-700 shadow-xl p-1.5 rounded-xl flex gap-1 items-center">
      {tools.map(({ mode, label, icon, active }, i) => (
        <div key={mode} className="flex items-center">
          {i === 1 && <div className="w-px h-8 bg-slate-700 mr-1" />}
          <button
            onClick={() => onChangeTool(mode)}
            className={`p-2 rounded-lg flex flex-col items-center gap-1 min-w-[60px] transition-colors border ${
              toolMode === mode
                ? active
                : 'text-slate-500 hover:bg-slate-800/60 border-transparent'
            }`}
          >
            {icon}
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        </div>
      ))}
      <div className="ml-1 flex items-center gap-1 border-l border-slate-700 pl-2">
        {(['front', 'rear'] as EquipmentFaceSide[]).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => onChangeFaceSide(side)}
            className={`min-w-14 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors ${faceSide === side ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            {side === 'front' ? '앞면' : '후면'}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   4-D-2. CameraRig — 선택 랙으로 카메라 부드럽게 이동
   OrbitControls 내장 · 사용자 인터랙션 시 즉시 중단
══════════════════════════════════════════════ */
interface CameraRigProps {
  rackPos: { x: number; y: number; z: number } | null;
  overviewPos?: { x: number; y: number; z: number } | null;
  faceSide?: EquipmentFaceSide;
  resetKey?: number;
  dashboardMode?: boolean;
}

function CameraRig({ rackPos, overviewPos = null, faceSide = 'front', resetKey = 0, dashboardMode = false }: CameraRigProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const isAnimating = useRef(false);
  const destCam    = useRef(new THREE.Vector3(0, 10, 13));
  const destTarget = useRef(new THREE.Vector3(0, 0.8, 0));

  useEffect(() => {
    if (rackPos) {
      destCam.current.set(rackPos.x + 0.04, rackPos.y + 0.12, rackPos.z + (faceSide === 'front' ? 2.25 : -2.25));
      destTarget.current.set(rackPos.x, rackPos.y, rackPos.z);
    } else if (dashboardMode) {
      destCam.current.set(0, 1.15, 5.2);
      destTarget.current.set(0, 0.85, 0);
    } else if (overviewPos) {
      // 바닥 전체가 아니라 실제 랙 배치 영역을 중심으로 보여준다.
      const direction = faceSide === 'front' ? 1 : -1;
      destCam.current.set(overviewPos.x + 2.8 * direction, overviewPos.y + 3.2, overviewPos.z + 5.8 * direction);
      destTarget.current.set(overviewPos.x, overviewPos.y, overviewPos.z);
    } else {
      destCam.current.set(0, 10, 13);
      destTarget.current.set(0, 0.8, 0);
    }
    isAnimating.current = true;
  }, [rackPos?.x, rackPos?.y, rackPos?.z, overviewPos?.x, overviewPos?.y, overviewPos?.z, faceSide, resetKey, dashboardMode]);  // eslint-disable-line

  useFrame(() => {
    if (!isAnimating.current || !controlsRef.current) return;

    const camDist    = camera.position.distanceTo(destCam.current);
    const targetDist = (controlsRef.current.target as THREE.Vector3).distanceTo(destTarget.current);

    if (camDist < 0.005 && targetDist < 0.005) {
      isAnimating.current = false;
      return;
    }

    camera.position.lerp(destCam.current, 0.08);
    (controlsRef.current.target as THREE.Vector3).lerp(destTarget.current, 0.08);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableRotate
      enablePan
      enableZoom
      enableDamping
      dampingFactor={0.1}
      onStart={() => { isAnimating.current = false; }}
    />
  );
}

/* ══════════════════════════════════════════════
   (DetailEquipmentMesh / RackDetailScene 제거됨)
══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   5. 메인 컴포넌트
══════════════════════════════════════════════ */
export default function RoomView({ data, dashboardMode = false }: { data?: { room: { id: number; roomName: string } }; dashboardMode?: boolean }) {
  const roomId = data?.room?.id;

  const { data: roomData, isLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async (): Promise<RoomApiResponse> => {
      const res = await apiFetch(`/api/v1/rooms/${roomId}`);
      if (!res.ok) throw new Error('Failed to fetch room');
      return res.json();
    },
    enabled: !!roomId,
  });

  const { data: maintenanceTasks = [] } = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenanceTasks'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/maintenanceTasks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const activeFaultDeviceIds = useMemo(
    () => new Set(
      maintenanceTasks
        .filter((task) => task.kind === 'FAULT' && task.status !== 'DONE' && task.deviceId != null)
        .map((task) => task.deviceId as number),
    ),
    [maintenanceTasks],
  );

  const cols     = roomData?.gridWidth  ?? 10;
  const rows     = roomData?.gridHeight ?? 10;
  const roomName = roomData?.roomName   ?? data?.room?.roomName ?? '';

  const [racks,            setRacks           ] = useState<PlacedRack[]>([]);
  const [selectedId,       setSelectedId      ] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [toolMode,         setToolMode        ] = useState<ToolMode>('move');
  const [hoveredCell,      setHoveredCell     ] = useState<LogicalPos | null>(null);
  const [searchQuery,      setSearchQuery     ] = useState('');
  const [faultOnly,        setFaultOnly       ] = useState(false);
  const [dashboardPage,    setDashboardPage   ] = useState(0);
  const [faceSide,         setFaceSide        ] = useState<EquipmentFaceSide>('front');
  const [cameraResetKey,   setCameraResetKey  ] = useState(0);

  // API 데이터가 로드되면 랙 상태 초기화
  useEffect(() => {
    if (!roomData?.racks) return;
    setRacks(roomData.racks.map(r => ({
      id:       String(r.id),
      name:     r.rackName,
      posX:     r.posX + 1, // 0-based → 1-based
      posY:     r.posY + 1,
      unitSize: r.totalUnit,
      status:   'ACTIVE' as RackStatus,
    })));
  }, [roomData]);

  const selectedRack = useMemo(
    () => racks.find(r => r.id === selectedId) ?? null,
    [racks, selectedId],
  );

  const { data: faceplateModels = [] } = useQuery<ProductModelFaceplate[]>({
    queryKey: ['productModels'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/productModels');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: faceplatePortTemplates = [] } = useQuery<FaceplatePortTemplate[]>({
    queryKey: ['portTemplates'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/portTemplates');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const resolvedFaceplateModels = useMemo(() => faceplateModels.map((model) => {
    if (model.portCount) return model;
    const templateCount = faceplatePortTemplates
      .filter((template) => template.productModelId === model.id)
      .reduce((sum, template) => sum + Math.floor((template.endIndex - template.startIndex) / Math.max(1, template.indexStep)) + 1, 0);
    const portCount = ([16, 24, 48] as const).find((count) => count === templateCount);
    return portCount ? { ...model, portCount, portLayout: model.portLayout ?? 'DOUBLE_ROW' as const } : model;
  }), [faceplateModels, faceplatePortTemplates]);
  const faceplateModelById = useMemo(() => new Map(resolvedFaceplateModels.map((model) => [model.id, model])), [resolvedFaceplateModels]);
  const faceplateModelByName = useMemo(() => new Map(resolvedFaceplateModels.map((model) => [model.modelName.trim().toLowerCase(), model])), [resolvedFaceplateModels]);
  const resolveFaceplateModel = useCallback((device: Pick<ApiDevice, 'productModelId' | 'modelName'>) => (
    (device.productModelId != null ? faceplateModelById.get(device.productModelId) : undefined)
    ?? faceplateModelByName.get(device.modelName.trim().toLowerCase())
  ), [faceplateModelById, faceplateModelByName]);

  // 선택 랙 장비 상세 API
  const { data: rackDetail, isFetching: isLoadingDevices } = useQuery({
    queryKey: ['rack-detail', selectedId],
    queryFn: async (): Promise<ApiRackDetail> => {
      const res = await apiFetch(`/api/v1/racks/${selectedId}`);
      if (!res.ok) throw new Error('Failed to fetch rack detail');
      return res.json();
    },
    enabled: !!selectedId && !selectedId.startsWith('rack-'),
  });

  const selectedRackDevices = useMemo<RackDevice[]>(
    () => (rackDetail?.devices ?? []).map((device) => apiDeviceToRackDevice(device, resolveFaceplateModel(device))),
    [rackDetail, resolveFaceplateModel],
  );

  const dashboardRackQueries = useQueries({
    queries: racks.map((rack) => ({
          queryKey: ['rack-detail', rack.id],
          queryFn: async (): Promise<ApiRackDetail> => {
            const res = await apiFetch(`/api/v1/racks/${rack.id}`);
            if (!res.ok) throw new Error('Failed to fetch rack detail');
            return res.json();
          },
          staleTime: 0,
          refetchInterval: dashboardMode ? 5_000 : false,
        })),
  });

  const dashboardDevicesByRack = useMemo(() => {
    const result = new Map<string, RackDevice[]>();
    dashboardRackQueries.forEach((query, index) => {
      const rack = racks[index];
      if (rack && query.data) result.set(rack.id, query.data.devices.map((device) => apiDeviceToRackDevice(device, resolveFaceplateModel(device))));
    });
    return result;
  }, [dashboardRackQueries, racks, resolveFaceplateModel]);

  // 장비 상세 API
  const { data: deviceDetail, isFetching: isLoadingDevice } = useQuery({
    queryKey: ['device-detail', selectedDeviceId],
    queryFn: async (): Promise<ApiDeviceDetail> => {
      const res = await apiFetch(`/api/v1/devices/${selectedDeviceId}`);
      if (!res.ok) throw new Error('Failed to fetch device');
      return res.json();
    },
    enabled: !!selectedDeviceId,
  });

  // 케이블 "바로가기"용: 장비→랙 매핑 (같은 방 안의 다른 랙으로 연결된 케이블을 추적하기 위함)
  const { data: devicesFlat = [] } = useQuery({
    queryKey: ['devices-flat-all'],
    queryFn: async (): Promise<ApiDeviceFlat[]> => {
      const res = await apiFetch('/api/v1/devices');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 5_000,
  });
  const liveDevicesByRack = useMemo(() => {
    const result = new Map<string, RackDevice[]>();
    devicesFlat.forEach((device) => {
      if (device.rackId == null) return;
      const key = String(device.rackId);
      const current = result.get(key) ?? [];
      current.push(apiDeviceToRackDevice(device, resolveFaceplateModel(device)));
      result.set(key, current);
    });
    result.forEach((items) => items.sort((a, b) => a.startU - b.startU));
    return result;
  }, [devicesFlat, resolveFaceplateModel]);
  const liveSelectedRackDevices = selectedId ? (liveDevicesByRack.get(selectedId) ?? selectedRackDevices) : selectedRackDevices;
  const deviceRackMap = useMemo(
    () => new Map(devicesFlat.map(d => [d.id, d.rackId])),
    [devicesFlat],
  );
  const activeFaultRackIds = useMemo(
    () => new Set(
      [...activeFaultDeviceIds]
        .map((deviceId) => deviceRackMap.get(deviceId))
        .filter((rackId): rackId is number => rackId != null),
    ),
    [activeFaultDeviceIds, deviceRackMap],
  );
  const rackNameById = useMemo(
    () => new Map(racks.map(r => [Number(r.id), r.name])),
    [racks],
  );

  const rackSearchResults = useMemo<RackSearchResult[]>(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase('ko-KR');

    return racks.flatMap(rack => {
      const matchedDevices = devicesFlat.filter(device => {
        if (device.rackId !== Number(rack.id)) return false;
        if (faultOnly && !activeFaultDeviceIds.has(device.id)) return false;
        if (!keyword) return true;
        const searchable = [
          device.deviceName,
          device.hostName,
          device.assetNo,
          device.serialNumber,
          device.modelName,
          device.bizName,
          device.deviceType,
          ...(device.ports ?? []).flatMap(port => [port.connectionAddress, port.deviceNetworkName]),
        ];
        return searchable.some(value => value?.toLocaleLowerCase('ko-KR').includes(keyword));
      });

      const rackNameMatches = !!keyword && rack.name.toLocaleLowerCase('ko-KR').includes(keyword);
      const shouldShow = faultOnly
        ? matchedDevices.length > 0
        : !keyword || rackNameMatches || matchedDevices.length > 0;
      return shouldShow
        ? [{ rack, matchedDevices: keyword || faultOnly ? matchedDevices : [] }]
        : [];
    });
  }, [activeFaultDeviceIds, devicesFlat, faultOnly, racks, searchQuery]);

  const filteredRacks = useMemo(
    () => rackSearchResults.map(result => result.rack),
    [rackSearchResults],
  );

  const dashboardPageCount = Math.max(1, Math.ceil(racks.length / 3));
  const dashboardRacks = useMemo(
    () => racks.slice(dashboardPage * 3, dashboardPage * 3 + 3).map((rack, index) => ({ ...rack, posX: index + 1, posY: 1 })),
    [racks, dashboardPage],
  );

  useEffect(() => {
    if (!dashboardMode || dashboardPageCount <= 1) return;
    const timer = window.setInterval(() => setDashboardPage((page) => (page + 1) % dashboardPageCount), 5000);
    return () => window.clearInterval(timer);
  }, [dashboardMode, dashboardPageCount]);

  useEffect(() => {
    if (dashboardPage >= dashboardPageCount) setDashboardPage(0);
  }, [dashboardPage, dashboardPageCount]);

  // 랙 온도 표시용 환경센서 (방 단위로만 존재 — 랙 순번으로 결정적으로 하나씩 배정)
  const { data: envSensors = [] } = useQuery({
    queryKey: ['env-sensors'],
    queryFn: async (): Promise<ApiEnvSensor[]> => {
      const res = await apiFetch('/api/v1/envSensors');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const roomSensors = useMemo(
    () => envSensors.filter(s => normalizeRoomName(s.roomName) === normalizeRoomName(roomName)),
    [envSensors, roomName],
  );
  function rackTempC(rackId: string): number | null {
    if (roomSensors.length === 0) return null;
    const idx = racks.findIndex(r => r.id === rackId);
    if (idx < 0) return null;
    return roomSensors[idx % roomSensors.length].tempC;
  }

  // 라이선스: 장비에 배정된 소프트웨어 라이선스 조회
  const { data: swLicenses = [] } = useQuery({
    queryKey: ['swLicenses'],
    queryFn: async (): Promise<ApiSwLicense[]> => {
      const res = await apiFetch('/api/v1/swLicenses');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: licenseAssignments = [] } = useQuery({
    queryKey: ['licenseAssignments'],
    queryFn: async (): Promise<ApiLicenseAssignment[]> => {
      const res = await apiFetch('/api/v1/licenseAssignments');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const swLicenseById = useMemo(() => new Map(swLicenses.map(l => [Number(l.id), l])), [swLicenses]);
  const deviceLicenses = useMemo(
    () => licenseAssignments
      .filter(a => Number(a.deviceId) === Number(selectedDeviceId) && a.revokedAt == null)
      .flatMap(a => {
        const license = swLicenseById.get(Number(a.licenseId));
        if (!license) return [];
        const assignUnit = license.assignUnit ?? license.assignmentUnit;
        const rawQuantity = a.assignedQty ?? a.quantity ?? a.coreCount ?? 1;
        const packSize = Math.max(1, license.corePackSize ?? 1);
        const appliedQuantity = assignUnit === 'CORE'
          ? (a.appliedCoreCount ?? (rawQuantity % packSize === 0 ? rawQuantity : rawQuantity * packSize))
          : rawQuantity;
        const licenseUnitQty = a.licenseUnitQty
          ?? (assignUnit === 'CORE' ? Math.max(1, Math.ceil(appliedQuantity / packSize)) : rawQuantity);
        return [{
          ...license,
          assignUnit,
          assignedQty: appliedQuantity,
          licenseUnitQty,
        }];
      }),
    [licenseAssignments, selectedDeviceId, swLicenseById],
  );

  /** 케이블로 연결된 반대편 장비의 랙으로 이동 (같은 방 안에서만 지원) */
  function handleJumpToDevice(otherDeviceId: number) {
    const rackId = deviceRackMap.get(otherDeviceId);
    if (rackId == null || !rackNameById.has(rackId)) return;
    setSelectedId(String(rackId));
    setSelectedDeviceId(otherDeviceId);
  }

  function handleSearchDevice(device: ApiDeviceFlat) {
    if (device.rackId == null || !rackNameById.has(device.rackId)) return;
    setSelectedId(String(device.rackId));
    setSelectedDeviceId(device.id);
  }

  // ESC → 두 단계 해제 (장비 → 랙 → 전체)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedDeviceId) setSelectedDeviceId(null);
      else setSelectedId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDeviceId]);

  // 선택 랙의 월드 중심 좌표 → CameraRig로 전달
  const rackCameraTarget = useMemo(() => {
    if (!selectedRack) return null;
    const { x, z } = logicalToWorld(selectedRack.posX, selectedRack.posY, cols, rows);
    const H = selectedRack.unitSize * RACK_UNIT_HEIGHT;
    return { x, y: H / 2 + RACK_FLOOR_OFFSET, z };
  }, [selectedRack, cols, rows]);

  const rackOverviewTarget = useMemo(() => {
    if (racks.length === 0) return null;
    const positions = racks.map((rack) => logicalToWorld(rack.posX, rack.posY, cols, rows));
    const centerX = positions.reduce((sum, position) => sum + position.x, 0) / positions.length;
    const centerZ = positions.reduce((sum, position) => sum + position.z, 0) / positions.length;
    const averageHeight = racks.reduce((sum, rack) => sum + rack.unitSize * RACK_UNIT_HEIGHT, 0) / racks.length;
    return { x: centerX, y: averageHeight * 0.48 + RACK_FLOOR_OFFSET, z: centerZ };
  }, [racks, cols, rows]);

  /* ─ 바닥 클릭 ─ */
  const handleFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (toolMode !== 'place') return;
    e.stopPropagation();

    const pos = worldToLogical(e.point, cols, rows);
    if (!pos) return;

    if (racks.some(r => r.posX === pos.col && r.posY === pos.row)) {
      alert('이미 랙이 존재합니다.');
      return;
    }

    setRacks(prev => [
      ...prev,
      {
        id:       `rack-${Date.now()}`,
        name:     `NEW-${pos.col}-${pos.row}`,
        posX:     pos.col,
        posY:     pos.row,
        unitSize: 42,
        status:   'ACTIVE',
      },
    ]);
  }, [toolMode, racks, cols, rows]);

  /* ─ 마우스 이동 ─ */
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (toolMode !== 'place') return;
    setHoveredCell(worldToLogical(e.point, cols, rows));
  }, [toolMode, cols, rows]);

  /* ─ 랙 클릭 ─ */
  const handleRackClick = useCallback((rackId: string) => {
    if (toolMode === 'delete') {
      setRacks(prev => prev.filter(r => r.id !== rackId));
      setSelectedId(null);
    } else {
      setSelectedId(rackId);
    }
  }, [toolMode]);

  const showGhost =
    toolMode === 'place' &&
    hoveredCell !== null &&
    !racks.some(r => r.posX === hoveredCell!.col && r.posY === hoveredCell!.row);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={36} className="animate-spin text-blue-400" />
          <p className="text-sm">룸 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] text-slate-100 font-sans overflow-hidden">

      {/* ─── 좌측 사이드바 ─── */}
      {!dashboardMode && (selectedId && selectedRack ? (
        <RackSidebar
          rack={selectedRack}
          devices={liveSelectedRackDevices}
          isLoading={isLoadingDevices}
          tempC={rackTempC(selectedRack.id)}
          activeFaultDeviceIds={activeFaultDeviceIds}
          onClose={() => setSelectedId(null)}
          onSelectDevice={setSelectedDeviceId}
        />
      ) : (
        <RackListSidebar
          results={rackSearchResults}
          searchQuery={searchQuery}
          faultOnly={faultOnly}
          activeFaultDeviceIds={activeFaultDeviceIds}
          activeFaultRackIds={activeFaultRackIds}
          onSearch={setSearchQuery}
          onFaultOnlyChange={setFaultOnly}
          onSelectRack={handleRackClick}
          onSelectDevice={handleSearchDevice}
        />
      ))}

      {/* ─── 3D 뷰포트 ─── */}
      <div className="flex-1 relative overflow-hidden">

        {/* 헤더 */}
        {!dashboardMode && <div className="absolute top-5 left-5 z-10 pointer-events-none">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-xl drop-shadow">
            <Server size={20} />
            <h1>{roomName}</h1>
          </div>
          <p className="text-slate-600 text-xs font-medium mt-0.5 pl-1">
            {cols} × {rows} Grid System
          </p>
        </div>}

        {/* 툴바 */}
        {!dashboardMode && <Toolbar toolMode={toolMode} onChangeTool={setToolMode} faceSide={faceSide} onChangeFaceSide={(side) => { setFaceSide(side); setCameraResetKey((key) => key + 1); }} />}

        {/* 3D Canvas */}
        <Canvas
          shadows
          dpr={[1.5, 2]}
          camera={dashboardMode ? { position: [0, 1.15, 5.2], fov: 34 } : { position: [0, 10, 13], fov: 50 }}
          style={{ width: '100%', height: '100%', display: 'block' }}
          gl={{ antialias: true }}
        >
          {/* 어두운 씬 배경 */}
          <color attach="background" args={['#0f0f0f']} />

          {/* 조명 */}
          <ambientLight intensity={0.45} />
          <directionalLight
            position={[5, 10, 7.5]}
            intensity={0.8}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <directionalLight position={[-5, 8, -5]} intensity={0.25} />
          {/* 포인트 라이트 — 파란 분위기 */}
          <pointLight position={[-3, 2, 3]} intensity={2.0} color="#3b82f6" />

          <group>
            <FloorBoard cols={dashboardMode ? 3 : cols} rows={dashboardMode ? 1 : rows} />

            {/* 투명 클릭/호버 감지 레이어 */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.06, 0]}
              onClick={handleFloorClick}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoveredCell(null)}
            >
              <planeGeometry args={[cols, rows]} />
              <meshBasicMaterial visible={false} />
            </mesh>

            {/* 랙 목록 — 선택 시 해당 랙만 표시, 검색 시 필터 */}
            {(dashboardMode ? dashboardRacks : filteredRacks)
              .filter(rack => dashboardMode || !selectedId || rack.id === selectedId)
              .map(rack => (
                <RackModel
                  key={rack.id}
                  rack={rack}
                  cols={dashboardMode ? 3 : cols}
                  rows={dashboardMode ? 1 : rows}
                  devices={liveDevicesByRack.get(rack.id) ?? (rack.id === selectedId ? selectedRackDevices : (dashboardDevicesByRack.get(rack.id) ?? []))}
                  isSelected={!dashboardMode && selectedId === rack.id}
                  isDeleteMode={!dashboardMode && toolMode === 'delete'}
                  tempC={rackTempC(rack.id)}
                  onClick={() => { if (!dashboardMode) handleRackClick(rack.id); }}
                  selectedDeviceStartU={liveSelectedRackDevices.find(d => d.id === selectedDeviceId)?.startU ?? null}
                  onDeviceClick={(device) => { if (device.id != null) setSelectedDeviceId(device.id); }}
                  hideWireframe
                  activeFaultDeviceIds={activeFaultDeviceIds}
                />
              ))
            }

            {/* 고스트 랙 */}
            {showGhost && hoveredCell && <GhostRack {...hoveredCell} cols={cols} rows={rows} />}
          </group>

          {/* 카메라 애니메이션 + OrbitControls */}
          <CameraRig
            rackPos={dashboardMode ? null : rackCameraTarget}
            overviewPos={dashboardMode ? null : rackOverviewTarget}
            faceSide={dashboardMode ? 'front' : faceSide}
            resetKey={cameraResetKey}
            dashboardMode={dashboardMode}
          />
          <ContactShadows
            opacity={0.4}
            scale={20}
            blur={2.5}
            far={5}
            position={[0, 0.01, 0]}
          />
        </Canvas>

        {dashboardMode && dashboardPageCount > 1 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur">
            <span className="mr-1 text-[10px] text-slate-400">5초 자동 전환</span>
            {Array.from({ length: dashboardPageCount }, (_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all ${index === dashboardPage ? 'w-5 bg-cyan-300' : 'w-1.5 bg-slate-600'}`} />
            ))}
          </div>
        )}

        {/* ─── 전체 보기 버튼 ─── */}
        {!dashboardMode && selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            className="absolute top-5 right-5 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 border border-slate-600 rounded-lg text-slate-300 text-xs hover:text-white hover:border-slate-400 transition-colors"
          >
            ← 전체 보기
          </button>
        )}

        {/* ─── 장비 상세 모달 ─── */}
        {!dashboardMode && selectedDeviceId && (
          <DeviceModal
            device={deviceDetail ?? null}
            isLoading={isLoadingDevice}
            licenses={deviceLicenses}
            productModel={deviceDetail ? resolveFaceplateModel(deviceDetail) : undefined}
            deviceRackMap={deviceRackMap}
            rackNameById={rackNameById}
            activeFaults={maintenanceTasks.filter((task) => task.kind === 'FAULT' && task.status !== 'DONE' && task.deviceId === selectedDeviceId)}
            completedFaults={maintenanceTasks
              .filter((task) => task.kind === 'FAULT' && task.status === 'DONE' && task.deviceId === selectedDeviceId)
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))}
            onJumpToDevice={handleJumpToDevice}
            onClose={() => setSelectedDeviceId(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   6-A. 랙 목록 + 검색 사이드바
══════════════════════════════════════════════ */
function RackListSidebar({
  results,
  searchQuery,
  faultOnly,
  activeFaultDeviceIds,
  activeFaultRackIds,
  onSearch,
  onFaultOnlyChange,
  onSelectRack,
  onSelectDevice,
}: {
  results: RackSearchResult[];
  searchQuery: string;
  faultOnly: boolean;
  activeFaultDeviceIds: Set<number>;
  activeFaultRackIds: Set<number>;
  onSearch: (q: string) => void;
  onFaultOnlyChange: (value: boolean) => void;
  onSelectRack: (id: string) => void;
  onSelectDevice: (device: ApiDeviceFlat) => void;
}) {
  const deviceResultCount = results.reduce((sum, result) => sum + result.matchedDevices.length, 0);

  return (
    <div className="w-72 h-full flex flex-col bg-[#0a0a0a] border-r border-slate-800 text-slate-200 shrink-0">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-[#0d0d0d]">
        <Server size={15} className="text-blue-400 shrink-0" />
        <span className="font-bold text-sm">랙 목록</span>
        <span className="ml-auto text-[10px] text-slate-500">
          {results.length}개 렉{searchQuery && deviceResultCount > 0 ? ` · 장비 ${deviceResultCount}대` : ''}
        </span>
      </div>

      {/* 검색 입력 */}
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
          <Search size={13} className="text-slate-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder="랙 · 장비명 · 호스트명 · IP 검색..."
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none"
          />
          {searchQuery && (
            <button onClick={() => onSearch('')} className="text-slate-500 hover:text-slate-300">
              <X size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onFaultOnlyChange(!faultOnly)}
          className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors ${faultOnly ? 'border-red-400 bg-red-500/20 text-red-200' : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-red-500/50 hover:text-red-300'}`}
        >
          <AlertTriangle size={12} className={faultOnly ? 'animate-pulse' : ''} />
          장애 장비만 보기
        </button>
      </div>

      {/* 랙 목록 */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
            {searchQuery ? '검색 결과 없음' : '랙 없음'}
          </div>
        ) : (
          <div className="py-1">
            {results.map(({ rack, matchedDevices }) => (
              <div key={rack.id} className="border-b border-slate-900">
                <button
                  onClick={() => onSelectRack(rack.id)}
                  className="group flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-900/60"
                >
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${activeFaultRackIds.has(Number(rack.id)) ? 'animate-pulse shadow-[0_0_10px_#ef4444]' : ''}`}
                    style={{ backgroundColor: activeFaultRackIds.has(Number(rack.id)) ? '#ef4444' : STATUS_COLOR[rack.status] }}
                  />
                  <span className={`flex-1 truncate text-xs font-medium ${activeFaultRackIds.has(Number(rack.id)) ? 'text-red-300' : 'text-slate-200'}`}>{rack.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-600">{rack.unitSize}U</span>
                  <span className="shrink-0 text-xs text-slate-600 group-hover:text-slate-400">›</span>
                </button>

                {matchedDevices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => onSelectDevice(device)}
                    className={`group flex w-full items-start gap-2 border-t px-6 py-2 text-left transition-colors ${activeFaultDeviceIds.has(device.id) ? 'border-red-900/60 bg-red-950/35 hover:bg-red-950/55' : 'border-slate-900/80 bg-blue-950/20 hover:bg-blue-950/45'}`}
                  >
                    {activeFaultDeviceIds.has(device.id) ? <AlertTriangle size={12} className="mt-0.5 shrink-0 animate-pulse text-red-400" /> : <Server size={12} className="mt-0.5 shrink-0 text-blue-400" />}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-medium ${activeFaultDeviceIds.has(device.id) ? 'text-red-100' : 'text-blue-100'}`}>{device.deviceName}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {[device.hostName, device.modelName].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ArrowUpRightFromSquare size={11} className="mt-0.5 shrink-0 text-slate-600 group-hover:text-blue-300" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   6. 랙 사이드바 컴포넌트
══════════════════════════════════════════════ */
const TYPE_BADGE: Record<DeviceType, { label: string; color: string }> = {
  'server-1u': { label: 'SERVER',  color: '#3b82f6' },
  'server-2u': { label: 'SERVER',  color: '#60a5fa' },
  'switch':    { label: 'SWITCH',  color: '#22c55e' },
  'patch':     { label: 'PATCH',   color: '#f59e0b' },
  'empty':     { label: 'EMPTY',   color: '#374151' },
};

function RackSidebar({
  rack,
  devices,
  isLoading,
  tempC,
  activeFaultDeviceIds,
  onClose,
  onSelectDevice,
}: {
  rack: PlacedRack;
  devices: RackDevice[];
  isLoading: boolean;
  tempC: number | null;
  activeFaultDeviceIds: Set<number>;
  onClose: () => void;
  onSelectDevice: (deviceId: number) => void;
}) {
  const usedUnits = devices.reduce((s, d) => s + d.height, 0);
  const tempColor = tempC == null ? '#64748b' : tempColorFor(tempC);

  return (
    <div className="w-72 h-full flex flex-col bg-[#0a0a0a] border-r border-slate-800 text-slate-200 shrink-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0d0d0d]">
        <div className="flex items-center gap-2 min-w-0">
          <Server size={15} className="text-blue-400 shrink-0" />
          <span className="font-bold text-sm truncate">{rack.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tempC != null && (
            <span
              className="flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ color: tempColor, backgroundColor: `${tempColor}22` }}
            >
              <Thermometer size={12} />
              {tempC}℃
            </span>
          )}
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 요약 */}
      <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-500 flex gap-4">
        <span>총 <span className="text-slate-300 font-semibold">{rack.unitSize}U</span></span>
        <span>사용 <span className="text-blue-400 font-semibold">{usedUnits}U</span></span>
        <span>여유 <span className="text-emerald-400 font-semibold">{rack.unitSize - usedUnits}U</span></span>
      </div>

      {/* 장비 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-slate-500 gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">불러오는 중...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
            장비 없음
          </div>
        ) : (
          <div className="py-1">
            {devices.map((device, idx) => {
              const badge = TYPE_BADGE[device.type];
              const alarmed = device.id != null && activeFaultDeviceIds.has(device.id);
              if (device.type === 'empty') return null;
              return (
                <button
                  key={`${device.startU}-${idx}`}
                  onClick={() => { if (device.id != null) onSelectDevice(device.id); }}
                  disabled={device.id == null}
                  className={`w-full border-b px-4 py-2 text-left transition-colors disabled:cursor-default ${alarmed ? 'border-red-900/60 bg-red-950/35 hover:bg-red-950/55' : 'border-slate-900 hover:bg-slate-900/60 disabled:hover:bg-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-7 shrink-0">{device.startU}U</span>
                    {alarmed && <AlertTriangle size={11} className="shrink-0 animate-pulse text-red-400" />}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ color: badge.color, backgroundColor: `${badge.color}22` }}
                    >
                      {device.deviceTypeRaw ?? badge.label}
                    </span>
                    <span className={`truncate text-xs font-medium ${alarmed ? 'text-red-200' : 'text-slate-200'}`}>{device.name}</span>
                  </div>
                  {device.modelName && (
                    <p className="text-[10px] text-slate-500 mt-0.5 pl-9 truncate">{device.modelName}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   7. 장비 상세 모달
══════════════════════════════════════════════ */
const PORT_TYPE_COLOR: Record<string, string> = {
  MANAGEMENT: '#3b82f6',
  MAIN:       '#22c55e',
  BACKUP:     '#f59e0b',
  SERVICE:    '#a78bfa',
};

const CABLE_COLOR_DOT: Record<string, string> = {
  BLUE:   '#3b82f6',
  BLACK:  '#6b7280',
  GREEN:  '#22c55e',
  RED:    '#ef4444',
  PURPLE: '#a855f7',
  WHITE:  '#e5e7eb',
  PINK:   '#ec4899',
  YELLOW: '#eab308',
};

/* 장비 단독 3D 프리뷰 씬 — 회전 시 후면 포트 확인 가능 */
function DevicePreviewScene({ device }: { device: RackDevice }) {
  const safeStartU = Math.max(1, Math.round(device.startU));
  const safeHeight = Math.max(1, Math.round(device.height));
  const yCenter = (safeStartU - 1) * RACK_UNIT_HEIGHT
    + safeHeight * RACK_UNIT_HEIGHT / 2;
  return (
    <>
      <color attach="background" args={['#050a14']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[1, 2, 2]} intensity={1.0} />
      <pointLight position={[-1, 1, 1.5]} intensity={2.0} color="#3b82f6" />
      <group position={[0, -yCenter, 0]}>
        <EquipmentMesh
          device={device}
          rackW={0.82}
          rackD={0.82}
          isSelected={false}
          onClick={() => {}}
        />
      </group>
      <OrbitControls autoRotate autoRotateSpeed={1.2} enableZoom enablePan={false} />
    </>
  );
}

function DeviceModal({
  device,
  isLoading,
  licenses,
  productModel,
  deviceRackMap,
  rackNameById,
  activeFaults,
  completedFaults,
  onJumpToDevice,
  onClose,
}: {
  device: ApiDeviceDetail | null;
  isLoading: boolean;
  licenses: ApiAllocatedLicense[];
  productModel?: ProductModelFaceplate;
  deviceRackMap: Map<number, number | null>;
  rackNameById: Map<number, string>;
  activeFaults: MaintenanceTask[];
  completedFaults: MaintenanceTask[];
  onJumpToDevice: (deviceId: number) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [faultFormOpen, setFaultFormOpen] = useState(false);
  const [faultTitle, setFaultTitle] = useState('');
  const [faultContent, setFaultContent] = useState('');
  const [faultAssignee, setFaultAssignee] = useState('');
  const [faultError, setFaultError] = useState('');

  const createFault = useMutation({
    mutationFn: async () => {
      if (!device) throw new Error('장비 정보를 불러오지 못했습니다.');
      if (!faultTitle.trim()) throw new Error('장애 제목을 입력해 주세요.');
      if (!faultAssignee.trim()) throw new Error('담당자를 입력해 주세요.');
      const now = new Date().toISOString();
      const res = await apiFetch('/api/v1/maintenanceTasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'FAULT',
          title: faultTitle.trim(),
          content: faultContent.trim(),
          deviceId: device.id,
          deviceName: device.deviceName,
          occurredAt: now,
          assigneeName: faultAssignee.trim(),
          status: 'RECEIVED',
          actionNote: null,
          createdAt: now,
        }),
      });
      if (!res.ok) throw new Error('장애 등록에 실패했습니다.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
      setFaultFormOpen(false);
      setFaultTitle('');
      setFaultContent('');
      setFaultAssignee('');
      setFaultError('');
    },
    onError: (error) => setFaultError(error instanceof Error ? error.message : '장애 등록에 실패했습니다.'),
  });

  /* ApiDeviceDetail → RackDevice 변환 (프리뷰용) */
  const previewDevice = device ? ((): RackDevice => {
    let type: DeviceType;
    if (device.deviceType === 'SWITCH' || /BACKBONE|CORE/i.test(device.deviceType)) type = 'switch';
    else if (device.deviceType === 'PDU') type = 'patch';
    else if (device.uSize >= 2)          type = 'server-2u';
    else                                 type = 'server-1u';
    return {
      id: device.id, startU: 1, height: device.uSize,
      name: device.deviceName, type,
      modelName: device.modelName,
      vendor: device.vendor,
      equipmentType: device.equipmentType,
      portCount: device.portCount,
      portLayout: device.portLayout,
      frontColor: device.frontColor, backColor: device.backColor,
      deviceTypeRaw: device.deviceType,
    };
  })() : null;
  const cpuSocketCount = device?.cpuSocketCount ?? productModel?.cpuSocketCount ?? 0;
  const coresPerSocket = device?.coresPerSocket ?? productModel?.coresPerSocket ?? 0;
  const totalCoreCount = device
    ? (device.totalCoreCount ?? productModel?.totalCoreCount ?? cpuSocketCount * coresPerSocket)
    : 0;
  const memoryGb = device?.memoryGb ?? productModel?.memoryGb ?? 0;
  const assignedCoreCount = licenses
    .filter((license) => license.assignUnit === 'CORE')
    .reduce((sum, license) => sum + license.assignedQty, 0);
  const hasCoreLicense = assignedCoreCount > 0;
  const remainingCoreCount = Math.max(0, totalCoreCount - assignedCoreCount);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 패널 */}
      <div className="relative w-[900px] max-h-[88vh] flex flex-col bg-[#0d0d0d] border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#111] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <Server size={15} className="text-blue-400" />
            <span className="font-bold text-sm text-slate-100">{device?.deviceName ?? '장비 로딩 중...'}</span>
            {device && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {device.deviceType}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {isLoading || !device || !previewDevice ? (
          <div className="flex items-center justify-center h-40 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">불러오는 중...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="shrink-0 border-b border-slate-800 bg-[#111827] px-5 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 text-xs font-semibold ${activeFaults.length > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${activeFaults.length > 0 ? 'animate-pulse bg-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-emerald-500'}`} />
                  {activeFaults.length > 0 ? `처리 중인 장애 ${activeFaults.length}건` : '현재 등록된 장애 없음'}
                </div>
                <button type="button" onClick={() => { setFaultFormOpen((open) => !open); setFaultError(''); }} className="ml-auto flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500">
                  <AlertTriangle size={13} /> 장애 등록
                </button>
              </div>
              {activeFaults.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeFaults.map((fault) => (
                    <span key={fault.id} className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
                      {fault.title} · {fault.status === 'RECEIVED' ? '접수' : '진행 중'}
                    </span>
                  ))}
                </div>
              )}
              <details className="mt-2 rounded-md border border-slate-700/70 bg-slate-950/40">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:text-white">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  완료된 장애 히스토리
                  <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{completedFaults.length}건</span>
                </summary>
                <div className="max-h-32 space-y-1.5 overflow-y-auto border-t border-slate-800 p-2">
                  {completedFaults.length === 0 ? (
                    <p className="px-1 py-2 text-[10px] text-slate-500">완료된 장애 이력이 없습니다.</p>
                  ) : completedFaults.map((fault) => (
                    <div key={fault.id} className="rounded-md bg-slate-900/80 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-200">{fault.title}</span>
                        <span className="shrink-0 text-[9px] text-slate-500">{new Date(fault.occurredAt).toLocaleString('ko-KR')}</span>
                      </div>
                      <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
                        <span>담당자: {fault.assigneeName || '-'}</span>
                        <span className="truncate text-emerald-300">조치: {fault.actionNote || '완료 처리'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              {faultFormOpen && (
                <form className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-red-500/30 bg-black/25 p-3" onSubmit={(event) => { event.preventDefault(); setFaultError(''); createFault.mutate(); }}>
                  <label className="grid gap-1 text-[10px] font-medium text-slate-400">
                    장애 제목 *
                    <input value={faultTitle} onChange={(event) => setFaultTitle(event.target.value)} className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-white outline-none focus:border-red-400" placeholder="예: 전원 장애 발생" autoFocus />
                  </label>
                  <label className="grid gap-1 text-[10px] font-medium text-slate-400">
                    담당자 *
                    <input value={faultAssignee} onChange={(event) => setFaultAssignee(event.target.value)} className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-white outline-none focus:border-red-400" placeholder="담당자 이름" />
                  </label>
                  <label className="col-span-2 grid gap-1 text-[10px] font-medium text-slate-400">
                    장애 내용
                    <input value={faultContent} onChange={(event) => setFaultContent(event.target.value)} className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-white outline-none focus:border-red-400" placeholder="증상과 확인 내용을 입력하세요." />
                  </label>
                  {faultError && <p className="col-span-2 text-xs text-red-300">{faultError}</p>}
                  <div className="col-span-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setFaultFormOpen(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300">취소</button>
                    <button type="submit" disabled={createFault.isPending} className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{createFault.isPending ? '등록 중...' : '장애 접수'}</button>
                  </div>
                </form>
              )}
            </div>
            {/* 상단: 3D 프리뷰 (전체 너비) */}
            <div className="w-full h-72 shrink-0 border-b border-slate-800">
              <Canvas
                camera={{ position: [0, 0, 0.55], fov: 50 }}
                style={{ width: '100%', height: '100%' }}
                gl={{ antialias: true }}
              >
                <DevicePreviewScene device={previewDevice} />
              </Canvas>
            </div>

            {/* 하단: 기본정보 | 포트 | 케이블 | 라이선스 — 4열 */}
            <div className="grid grid-cols-4 flex-1 overflow-hidden divide-x divide-slate-800">
              {/* 기본 정보 */}
              <div className="px-4 py-3 space-y-2 overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">기본 정보</p>
                <InfoRow label="모델" value={device.modelName} />
                <InfoRow label="타입" value={device.deviceType} />
                <InfoRow label="상태" value={device.status} highlight={device.status === 'ACTIVE'} />
                <InfoRow label="위치" value={`U${device.uPosition}`} />
                <InfoRow label="크기" value={`${device.uSize}U`} />
                {totalCoreCount > 0 && (
                  <>
                    <InfoRow
                      label="소켓"
                      value={`${cpuSocketCount}개`}
                    />
                    <InfoRow label="코어" value={`${totalCoreCount}코어 (${coresPerSocket}코어/소켓)`} />
                    {memoryGb > 0 && <InfoRow label="메모리" value={`${memoryGb}GB`} />}
                    {hasCoreLicense && (
                      <>
                        <InfoRow label="적용 코어" value={`${assignedCoreCount}코어`} />
                        <InfoRow label="미적용" value={`${remainingCoreCount}코어`} highlight={remainingCoreCount > 0} />
                      </>
                    )}
                  </>
                )}
              </div>

              {/* 포트 */}
              <div className="px-4 py-3 overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  포트 ({device.ports.length})
                </p>
                <div className="space-y-1.5">
                  {device.ports.map((port, index) => (
                    <div key={port.id != null ? `port-${port.id}` : `port-${port.deviceNetworkName}-${port.type}-${index}`} className="bg-slate-900/60 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            color: PORT_TYPE_COLOR[port.type] ?? '#94a3b8',
                            backgroundColor: `${PORT_TYPE_COLOR[port.type] ?? '#94a3b8'}22`,
                          }}
                        >
                          {port.type}
                        </span>
                        <span className="text-xs text-slate-300 truncate">{port.deviceNetworkName}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{port.clientType}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">{port.connectionAddress}</p>
                      {port.gateway && (
                        <p className="text-[9px] text-slate-600">GW: {port.gateway}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 케이블 */}
              <div className="px-4 py-3 overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  케이블 ({device.cableLinks.length})
                </p>
                <div className="space-y-1.5">
                  {device.cableLinks.map((link, index) => {
                    const otherId = link.srcDeviceId === device.id ? link.destDeviceId : link.srcDeviceId;
                    const otherName = link.srcDeviceId === device.id ? link.destDeviceName : link.srcDeviceName;
                    const otherRackId = deviceRackMap.get(otherId);
                    const otherRackName = otherRackId != null ? rackNameById.get(otherRackId) : undefined;
                    return (
                      <div key={link.id != null ? `cable-${link.id}` : `cable-${link.srcDeviceId}-${link.srcPortName}-${link.destDeviceId}-${link.destPortName}-${index}`} className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: CABLE_COLOR_DOT[link.color] ?? '#6b7280' }}
                          />
                          <span className="text-[10px] text-slate-400 font-medium">{link.cableType}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono pl-3.5">
                          {link.srcPortName} → {link.destPortName}
                        </p>
                        {otherName && (
                          <div className="flex items-center gap-1.5 mt-1 pl-3.5">
                            <span className="text-[10px] text-slate-300 truncate">
                              연결됨: <span className="font-semibold">{otherName}</span>
                              {otherRackName && <span className="text-slate-500"> ({otherRackName})</span>}
                            </span>
                            {otherRackName && (
                              <button
                                onClick={() => onJumpToDevice(otherId)}
                                className="ml-auto flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 shrink-0"
                              >
                                바로가기 <ArrowUpRightFromSquare size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 라이선스 */}
              <div className="px-4 py-3 overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  설치된 라이선스 ({licenses.length})
                </p>
                {licenses.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <p className="text-[11px] font-medium text-amber-300">이 장비에 할당된 라이선스가 없습니다.</p>
                    <p className="mt-1 text-[9px] leading-4 text-slate-500">라이선스 등록만으로는 설치 목록에 표시되지 않습니다. 라이선스 관리 또는 검수완료 장비 배치에서 이 자산에 할당하세요.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {licenses.map((lic, index) => (
                      <div key={`${lic.id}-${index}`} className="bg-slate-900/60 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <KeyRound size={10} className="text-amber-400 shrink-0" />
                          <span className="text-[11px] text-slate-200 font-medium truncate">{lic.swName}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 pl-4">{lic.category} · v{lic.version}</p>
                        <div className="mt-1.5 ml-4 flex flex-wrap gap-1">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
                            {lic.assignUnit === 'CORE'
                              ? '물리 코어당'
                              : lic.assignUnit === 'PROCESSOR'
                                ? '프로세서(소켓)당'
                                : lic.assignUnit === 'AGENT'
                                  ? '에이전트당'
                                  : '장비(노드)당'}
                          </span>
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-300">
                            {lic.assignUnit === 'CORE'
                              ? `${lic.licenseUnitQty}개 할당 · ${lic.assignedQty}코어 적용`
                              : `${lic.assignedQty}${lic.assignUnit === 'PROCESSOR' ? '소켓 할당' : '개 할당'}`}
                          </span>
                        </div>
                      </div>
                    ))}
                    {totalCoreCount > 0 && (
                      <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                        <p className="text-[10px] font-bold text-blue-300">코어 라이선스 현황</p>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                          <div><p className="text-[9px] text-slate-500">총 코어</p><p className="text-xs font-bold text-slate-200">{totalCoreCount}</p></div>
                          <div><p className="text-[9px] text-slate-500">라이선스 적용 코어</p><p className="text-xs font-bold text-blue-300">{assignedCoreCount}</p></div>
                          <div><p className="text-[9px] text-slate-500">라이선스 미적용 코어</p><p className="text-xs font-bold text-emerald-300">{remainingCoreCount}</p></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-600 w-10 shrink-0">{label}</span>
      <span className={`text-xs truncate ${highlight ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  );
}
