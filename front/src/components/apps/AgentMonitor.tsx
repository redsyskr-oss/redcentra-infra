'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/** 에이전트 수집정보 — UI-MON-001 */
interface Agent {
  id: number;
  deviceId: number;
  deviceName: string;
  status: 'NORMAL' | 'NOT_RECEIVED';
  lastReceivedAt: string;
}

interface Perf {
  agentId: number;
  cpuPercent: number;
  memPercent: number;
  collectedAt: string;
}

interface Disk {
  agentId: number;
  diskPath: string;
  totalGb: number;
  usedGb: number;
}

function Gauge({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 90 ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#3b82f6';
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-xs">{percent}%</span>
    </div>
  );
}

export default function AgentMonitor({ data: _data }: { data?: unknown }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch('/api/v1/agents');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: perfs = [] } = useQuery<Perf[]>({
    queryKey: ['agentPerformance'],
    queryFn: async () => {
      const res = await fetch('/api/v1/agentPerformance');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: disks = [] } = useQuery<Disk[]>({
    queryKey: ['agentDisk'],
    queryFn: async () => {
      const res = await fetch('/api/v1/agentDisk');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const perf = perfs.find((p) => p.agentId === selectedId);
  const disk = disks.find((d) => d.agentId === selectedId);

  const normalCount = agents.filter((a) => a.status === 'NORMAL').length;

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          에이전트 ({normalCount} 정상 / {agents.length - normalCount} 미수신)
        </div>
        <ScrollArea className="h-[calc(100%-33px)]">
          {isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중...</div>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={cn('flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm hover:bg-accent', selectedId === a.id && 'bg-accent')}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', a.status === 'NORMAL' ? 'bg-emerald-500' : 'bg-red-500')} />
                {a.deviceName}
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 p-4">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">좌측에서 장비를 선택하세요.</div>
        ) : (
          <div className="max-w-md space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{selected.deviceName}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              상태: {selected.status === 'NORMAL' ? '정상' : '미수신'} · 최근 수신: {selected.lastReceivedAt}
            </p>

            {perf ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">실시간 성능 (최근 수집)</div>
                <Gauge label="CPU" percent={perf.cpuPercent} />
                <Gauge label="MEM" percent={perf.memPercent} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">성능 데이터가 없습니다.</p>
            )}

            {disk ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="text-xs font-medium text-muted-foreground">디스크 ({disk.diskPath})</div>
                <Gauge label="사용량" percent={Math.round((disk.usedGb / disk.totalGb) * 100)} />
                <p className="text-xs text-muted-foreground">{disk.usedGb}GB / {disk.totalGb}GB</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">디스크 데이터가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
