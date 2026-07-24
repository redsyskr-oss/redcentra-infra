'use client';

import { AlertTriangle, ArrowUpRightFromSquare, Loader2, Move, PackagePlus, Search, Server, Thermometer, Trash2, X } from 'lucide-react';
import { type EquipmentFaceSide } from '@/lib/equipment-faceplate';
import {
  ApiDeviceFlat, DeviceType, PlacedRack, RackDevice, RackSearchResult, STATUS_COLOR, ToolMode,
} from './types';
import { tempColorFor } from './scene';

/* ══════════════════════════════════════════════
   4-D. Toolbar — 다크 테마
══════════════════════════════════════════════ */
export interface ToolbarProps {
  toolMode: ToolMode;
  onChangeTool: (mode: ToolMode) => void;
  faceSide: EquipmentFaceSide;
  onChangeFaceSide: (side: EquipmentFaceSide) => void;
}

export function Toolbar({ toolMode, onChangeTool, faceSide, onChangeFaceSide }: ToolbarProps) {
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
   6-A. 랙 목록 + 검색 사이드바
══════════════════════════════════════════════ */
export function RackListSidebar({
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
export const TYPE_BADGE: Record<DeviceType, { label: string; color: string }> = {
  'server-1u': { label: 'SERVER',  color: '#3b82f6' },
  'server-2u': { label: 'SERVER',  color: '#60a5fa' },
  'switch':    { label: 'SWITCH',  color: '#22c55e' },
  'patch':     { label: 'PATCH',   color: '#f59e0b' },
  'empty':     { label: 'EMPTY',   color: '#374151' },
};

export function RackSidebar({
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

