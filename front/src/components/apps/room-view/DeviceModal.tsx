'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AlertTriangle, ArrowUpRightFromSquare, KeyRound, Loader2, Server, X } from 'lucide-react';
import { type EquipmentFaceSide } from '@/lib/equipment-faceplate';
import { apiFetch } from '@/lib/api';
import {
  ApiAllocatedLicense, ApiCableLink, ApiDeviceDetail, ApiPort, DeviceType,
  MaintenanceTask, ProductModelFaceplate, RackDevice,
  RACK_UNIT_HEIGHT, EQUIPMENT_UNIT_GAP,
} from './types';
import { EquipmentMesh } from './scene';

/* ══════════════════════════════════════════════
   7. 장비 상세 모달
══════════════════════════════════════════════ */
export const PORT_TYPE_COLOR: Record<string, string> = {
  MANAGEMENT: '#3b82f6',
  MAIN:       '#22c55e',
  BACKUP:     '#f59e0b',
  SERVICE:    '#a78bfa',
};

export const CABLE_COLOR_DOT: Record<string, string> = {
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
export function DevicePreviewScene({ device }: { device: RackDevice }) {
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

export function DeviceModal({
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

export function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-600 w-10 shrink-0">{label}</span>
      <span className={`text-xs truncate ${highlight ? 'text-emerald-400 font-semibold' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  );
}
