'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { AlertTriangle, Server, Loader2, X, Search, Thermometer, ArrowUpRightFromSquare, KeyRound } from 'lucide-react';
import { type EquipmentFaceSide } from '@/lib/equipment-faceplate';
import { apiFetch } from '@/lib/api';
import {
  ApiAllocatedLicense, ApiDevice, ApiDeviceDetail, ApiDeviceFlat, ApiEnvSensor,
  ApiLicenseAssignment, ApiRack, ApiRackDetail, ApiSwLicense, FaceplatePortTemplate,
  LogicalPos, MaintenanceTask, PlacedRack, ProductModelFaceplate, RackDevice,
  RackSearchResult, RackStatus, RoomApiResponse, ToolMode,
  RACK_UNIT_HEIGHT, RACK_FLOOR_OFFSET,
  apiDeviceToRackDevice, logicalToWorld, normalizeRoomName, worldToLogical,
} from './room-view/types';
import { CameraRig, FloorBoard, GhostRack, RackModel } from './room-view/scene';
import { RackListSidebar, RackSidebar, Toolbar } from './room-view/panels';
import { DeviceModal } from './room-view/DeviceModal';

/* ══════════════════════════════════════════════
   메인 컴포넌트 — 3D 씬/패널/모달은 ./room-view 모듈로 분리
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

  // 룸의 랙 목록은 racks 컬렉션에서 roomId로 조회한다 (rooms에 중첩 저장하지 않음)
  const { data: roomRacks } = useQuery<ApiRack[]>({
    queryKey: ['room-racks', roomId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/racks?roomId=${roomId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!roomId,
  });

  // API 데이터가 로드되면 랙 상태 초기화
  useEffect(() => {
    if (!roomRacks) return;
    setRacks(roomRacks.map(r => ({
      id:       String(r.id),
      name:     r.rackName,
      posX:     r.posX + 1, // 0-based → 1-based
      posY:     r.posY + 1,
      unitSize: r.totalUnit,
      status:   'ACTIVE' as RackStatus,
    })));
  }, [roomRacks]);

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

