'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Check, Droplets, Server, Settings2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import DashboardNetworkWidget from './DashboardNetworkWidget';
import DashboardRoomWidget from './DashboardRoomWidget';
import { apiFetch } from '@/lib/api';

interface WidgetDef { id: string; title: string; }
const WIDGET_DEFS: WidgetDef[] = [
  { id: 'server', title: '서버 리소스 현황' },
  { id: 'network', title: '네트워크 리소스 현황' },
  { id: 'diagram', title: '네트워크 구성도' },
  { id: 'room3d', title: '서버실 랙 3D 배치' },
  { id: 'facility', title: '시설장비 리소스 현황' },
  { id: 'serverEvents', title: '서버 실시간 이벤트' },
  { id: 'netEvents', title: '네트워크 · 시설 실시간 이벤트' },
];
const STORAGE_KEY = 'redcentra.dashboard.noc-widgets.v1';

function loadHidden(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** 대시보드 — UI-COM-002
 * 관제실(NOC) 스타일: 좌(서버·네트워크 리소스) / 중앙(네트워크 구성도) / 우(시설장비 리소스) 고정 레이아웃 +
 * 하단 실시간 이벤트 스트립.
 */
interface AgentPerf {
  agentId: number;
  deviceName: string;
  cpuPercent: number;
  memPercent: number;
}

interface TrafficPoint {
  network: 'BUSINESS' | 'INTERNET';
  t: string;
  mbps: number;
}

interface UpsRow {
  id: number;
  label: string;
  chargeVoltage: number;
  dischargeVoltage: number;
  loadPercent: number;
  batteryPercent: number;
  frequencyHz: number;
}

interface EnvSensor {
  id: number;
  label: string;
  roomName: string;
  tempC: number;
  humidityPercent: number;
}

interface LeakSensor {
  id: number;
  label: string;
  status: string;
}

interface MaintenanceTask {
  id: number;
  kind: 'FAULT' | 'WORK';
  title: string;
  deviceName: string | null;
  assigneeName: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'DONE';
  occurredAt: string;
}

interface InterfaceLog {
  id: number;
  interfaceCode: string;
  result: 'SUCCESS' | 'FAIL';
  message: string;
  createdAt: string;
}

const PANEL = 'rounded-lg border border-white/10 bg-[#0f1c33] shadow-[0_2px_10px_rgba(0,0,0,.25)]';
const PANEL_HEAD = 'border-b border-white/10 px-3 py-2 text-[12px] font-semibold tracking-wide text-cyan-300';

function Bar({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 90 ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#3b82f6';
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <span className="w-24 shrink-0 truncate text-[11px] text-slate-300">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-300">{percent}%</span>
    </div>
  );
}

function ServerResourcePanel() {
  const { data: perfs = [] } = useQuery<AgentPerf[]>({
    queryKey: ['agentPerformance'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/agentPerformance');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const cpuTop5 = [...perfs].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 5);
  const memTop5 = [...perfs].sort((a, b) => b.memPercent - a.memPercent).slice(0, 5);

  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>서버 리소스 현황</div>
      <div className="space-y-1 py-2">
        <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400">CPU TOP5</div>
        {cpuTop5.map((p) => <Bar key={p.agentId} label={p.deviceName} percent={p.cpuPercent} />)}
      </div>
      <div className="space-y-1 border-t border-white/10 py-2">
        <div className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400">MEM TOP5</div>
        {memTop5.map((p) => <Bar key={p.agentId} label={p.deviceName} percent={p.memPercent} />)}
      </div>
    </div>
  );
}

function TrafficChart({ title, data }: { title: string; data: TrafficPoint[] }) {
  return (
    <div className="px-3 py-2">
      <div className="pb-1 text-[10px] font-bold tracking-wider text-slate-400">{title}</div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="t" fontSize={9} tickLine={false} axisLine={false} stroke="#64748b" />
            <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="#64748b" width={36} />
            <Tooltip contentStyle={{ background: '#0f1c33', border: '1px solid rgba(255,255,255,.1)', fontSize: 11 }} />
            <Line type="monotone" dataKey="mbps" name="Mbps" stroke="#35e0c8" dot={false} strokeWidth={1.75} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function NetworkResourcePanel() {
  const { data: traffic = [] } = useQuery<TrafficPoint[]>({
    queryKey: ['networkTraffic'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/networkTraffic');
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>네트워크 리소스 현황</div>
      <TrafficChart title="업무망 트래픽 추이" data={traffic.filter((t) => t.network === 'BUSINESS')} />
      <div className="border-t border-white/10">
        <TrafficChart title="인터넷망 트래픽 추이" data={traffic.filter((t) => t.network === 'INTERNET')} />
      </div>
    </div>
  );
}

function FacilityPanel() {
  const { data: ups = [] } = useQuery<UpsRow[]>({
    queryKey: ['upsStatus'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/upsStatus');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: envSensors = [] } = useQuery<EnvSensor[]>({
    queryKey: ['envSensors'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/envSensors');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: leaks = [] } = useQuery<LeakSensor[]>({
    queryKey: ['leakSensors'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/leakSensors');
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>시설장비 리소스 현황</div>

      <div className="grid grid-cols-2 gap-2 p-2.5">
        {ups.map((u) => (
          <div key={u.id} className="rounded-md border border-white/10 bg-white/5 p-2 text-[10.5px] text-slate-300">
            <div className="mb-1 flex items-center gap-1 font-semibold text-cyan-300">
              <Zap className="h-3 w-3" /> {u.label}
            </div>
            <div>충전 {u.chargeVoltage} V</div>
            <div>방전 {u.dischargeVoltage} V</div>
            <div>부하율 {u.loadPercent}%</div>
            <div>배터리 {u.batteryPercent}%</div>
            <div>{u.frequencyHz} Hz</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-2.5">
        {envSensors.map((s) => {
          const hot = s.tempC >= 28;
          return (
            <div key={s.id} className={cn('rounded-md border p-2 text-[10.5px]', hot ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-white/10 bg-white/5 text-slate-300')}>
              <div className="font-semibold">{s.label}</div>
              <div className="truncate text-slate-400">{s.roomName}</div>
              <div>온도 {s.tempC}℃ · 습도 {s.humidityPercent}%</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/10 p-2.5">
        {leaks.map((l) => (
          <span key={l.id} className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-medium text-emerald-300">
            <Droplets className="h-3 w-3" /> {l.label} {l.status}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventTable({ title, rows }: { title: string; rows: { tag: string; tagOk: boolean; main: string; sub: string; time: string }[] }) {
  return (
    <div className={cn(PANEL, 'flex min-h-0 flex-1 flex-col')}>
      <div className={PANEL_HEAD}>{title}</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-500">이벤트가 없습니다.</div>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 px-3 py-1.5 text-[11px] last:border-0">
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold', r.tagOk ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>
                {r.tag}
              </span>
              <span className="w-28 shrink-0 truncate text-slate-300">{r.main}</span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{r.sub}</span>
              <span className="shrink-0 text-slate-500">{r.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ data: _data }: { data?: unknown }) {
  const [editMode, setEditMode] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // localStorage는 클라이언트에서만 접근 가능 — SSR과의 hydration 불일치를 피하려면
  // 기본값(모두 표시)으로 먼저 렌더링한 뒤 마운트 후에 저장된 구성을 반영해야 한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(new Set(loadHidden()));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  }, [hidden]);

  function toggleWidget(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: tasks = [] } = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenanceTasks'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/maintenanceTasks');
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: logs = [] } = useQuery<InterfaceLog[]>({
    queryKey: ['interfaceLogs'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/interfaceLogs');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const serverEvents = [...tasks]
    .filter((t) => t.kind === 'FAULT')
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 8)
    .map((t) => ({ tag: t.status === 'DONE' ? '완료' : t.status === 'IN_PROGRESS' ? '진행' : '접수', tagOk: t.status === 'DONE', main: t.deviceName ?? '-', sub: t.title, time: t.occurredAt.slice(0, 16).replace('T', ' ') }));

  const netEvents = [...logs]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8)
    .map((l) => ({ tag: l.result === 'SUCCESS' ? '정상' : '실패', tagOk: l.result === 'SUCCESS', main: l.interfaceCode, sub: l.message, time: l.createdAt.slice(0, 16).replace('T', ' ') }));

  const show = (id: string) => !hidden.has(id);
  const leftVisible = show('server') || show('network');
  const bottomVisible = show('serverEvents') || show('netEvents');

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-auto bg-[#081124] p-2.5 text-slate-100">
      <div className="flex items-center gap-2 px-1">
        <Server className="h-4 w-4 text-cyan-300" />
        <h1 className="text-[13px] font-bold tracking-[.08em] text-cyan-300">통합 관제 대시보드</h1>
        {serverEvents.some((e) => !e.tagOk) && (
          <span className="ml-2 flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-medium text-red-300">
            <AlertTriangle className="h-3 w-3" /> 처리 중인 장애 있음
          </span>
        )}
        <button
          onClick={() => setEditMode((v) => !v)}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
            editMode ? 'border-cyan-300 bg-cyan-300 text-[#04211d]' : 'border-white/15 bg-white/5 text-slate-300 hover:border-cyan-300 hover:text-cyan-300',
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {editMode ? '편집 완료' : '위젯 편집'}
        </button>
      </div>

      {editMode && (
        <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-cyan-300/40 bg-white/5 p-2.5">
          {WIDGET_DEFS.map((w) => {
            const isOn = show(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggleWidget(w.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium',
                  isOn ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200' : 'border-white/15 text-slate-400',
                )}
              >
                <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-sm border', isOn ? 'border-cyan-300 bg-cyan-300' : 'border-white/25')}>
                  {isOn && <Check className="h-2.5 w-2.5 text-[#04211d]" />}
                </span>
                {w.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid min-h-[420px] flex-[3] grid-cols-1 gap-2.5 lg:grid-cols-[240px_1fr_260px]">
        {leftVisible && (
          <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
            {show('server') && <ServerResourcePanel />}
            {show('network') && <NetworkResourcePanel />}
          </div>
        )}

        {(show('diagram') || show('room3d')) && (
          <div className="grid min-h-0 grid-cols-2 gap-2.5">
            {show('diagram') && (
              <div className={cn(PANEL, 'flex min-h-[420px] flex-col p-2.5', !show('room3d') && 'col-span-2')}>
                <DashboardNetworkWidget />
              </div>
            )}
            {show('room3d') && (
              <div className={cn(PANEL, 'min-h-[420px] overflow-hidden', !show('diagram') && 'col-span-2')}>
                <DashboardRoomWidget />
              </div>
            )}
          </div>
        )}

        {show('facility') && (
          <div className="min-h-0 overflow-y-auto">
            <FacilityPanel />
          </div>
        )}
      </div>

      {bottomVisible && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-2">
          {show('serverEvents') && <EventTable title="서버 실시간 이벤트" rows={serverEvents} />}
          {show('netEvents') && <EventTable title="네트워크 · 시설 실시간 이벤트" rows={netEvents} />}
        </div>
      )}
    </div>
  );
}
