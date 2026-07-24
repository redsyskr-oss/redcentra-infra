'use client';

import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { equipmentFaceplateDataUrl, type EquipmentFaceSide } from '@/lib/equipment-faceplate';
import {
  DeviceType, LogicalPos, PlacedRack, RackDevice, STATUS_COLOR,
  RACK_UNIT_HEIGHT, EQUIPMENT_UNIT_GAP, RACK_FLOOR_OFFSET,
  logicalToWorld,
} from './types';

/* ══════════════════════════════════════════════
   4-A-1. EquipmentMesh — 랙 내부 장비 3D 메쉬
   선택된 랙에서 와이어프레임 사이드를 통해 보임
══════════════════════════════════════════════ */
export const EQUIP_3D: Record<Exclude<DeviceType, 'empty'>, {
  body: string; front: string; emissive: string; led: string;
}> = {
  'server-1u': { body: '#060e1c', front: '#0e2147', emissive: '#0d2060', led: '#3b82f6' },
  'server-2u': { body: '#060e1c', front: '#0e2147', emissive: '#0d2060', led: '#60a5fa' },
  'switch':    { body: '#050e06', front: '#092010', emissive: '#071a0a', led: '#22c55e' },
  'patch':     { body: '#100900', front: '#231500', emissive: '#1c1000', led: '#f59e0b' },
};

export const DEVICE_TYPE_LABEL: Record<Exclude<DeviceType, 'empty'>, string> = {
  'server-1u': 'SERVER 1U',
  'server-2u': 'SERVER 2U',
  'switch':    'SWITCH',
  'patch':     'PATCH',
};

export function compactRackLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

export interface EquipmentMeshProps {
  device: RackDevice;
  rackW: number;
  rackD: number;
  isSelected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  dashboardLabel?: boolean;
  alarmed?: boolean;
}

export function EquipmentFaceplate({ device, width, height, depth, side }: { device: RackDevice; width: number; height: number; depth: number; side: EquipmentFaceSide }) {
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

export function AlarmPulse({ width, height, z }: { width: number; height: number; z: number }) {
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

export function BlinkingRackName({ name, position, fontSize }: { name: string; position: [number, number, number]; fontSize: number }) {
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

export function EquipmentMesh({ device, rackW, rackD, isSelected, onClick, dashboardLabel = false, alarmed = false }: EquipmentMeshProps) {
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
export interface RackModelProps {
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

export function RackModel({ rack, cols, rows, devices, isSelected, isDeleteMode, tempC, onClick, selectedDeviceStartU, onDeviceClick, hideWireframe = false, activeFaultDeviceIds }: RackModelProps) {
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

export function tempColorFor(tempC: number): string {
  return tempC >= 28 ? '#f87171' : tempC >= 25 ? '#fbbf24' : '#34d399';
}

/* ══════════════════════════════════════════════
   4-B. GhostRack — 배치 미리보기
══════════════════════════════════════════════ */
export function GhostRack({ col, row, cols, rows }: LogicalPos & { cols: number; rows: number }) {
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
export function FloorBoard({ cols, rows }: { cols: number; rows: number }) {
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
   4-D-2. CameraRig — 선택 랙으로 카메라 부드럽게 이동
   OrbitControls 내장 · 사용자 인터랙션 시 즉시 중단
══════════════════════════════════════════════ */
export interface CameraRigProps {
  rackPos: { x: number; y: number; z: number } | null;
  overviewPos?: { x: number; y: number; z: number } | null;
  faceSide?: EquipmentFaceSide;
  resetKey?: number;
  dashboardMode?: boolean;
}

export function CameraRig({ rackPos, overviewPos = null, faceSide = 'front', resetKey = 0, dashboardMode = false }: CameraRigProps) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
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
    const targetDist = controlsRef.current.target.distanceTo(destTarget.current);

    if (camDist < 0.005 && targetDist < 0.005) {
      isAnimating.current = false;
      return;
    }

    camera.position.lerp(destCam.current, 0.08);
    controlsRef.current.target.lerp(destTarget.current, 0.08);
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

