'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 설비 · 전력정보 조회 — UI-LNK-001 */
interface FacilityMetric {
  id: number;
  roomId: number;
  roomName: string;
  metricType: string;
  metricValue: number;
  receivedAt: string;
}

interface InterfaceLog {
  id: number;
  interfaceCode: string;
  result: 'SUCCESS' | 'FAIL';
  message: string;
  createdAt: string;
}

const TABS = [
  { id: 'metric', label: '설비 · 전력정보' },
  { id: 'history', label: '수신 이력' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function FacilityView({ data: _data }: { data?: unknown }) {
  const [tab, setTab] = useState<TabId>('metric');

  const { data: metrics = [] } = useQuery<FacilityMetric[]>({
    queryKey: ['facilityMetrics'],
    queryFn: async () => {
      const res = await fetch('/api/v1/facilityMetrics');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: logs = [] } = useQuery<InterfaceLog[]>({
    queryKey: ['interfaceLogs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/interfaceLogs');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const roomNames = [...new Set(metrics.map((m) => m.roomName))];

  return (
    <div className="flex h-full flex-col p-4 gap-3">
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
              tab === t.id ? 'border-border border-b-background bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'metric' ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          {roomNames.map((roomName) => {
            const series = metrics
              .filter((m) => m.roomName === roomName)
              .map((m) => ({ d: m.receivedAt.slice(5, 10), temp: m.metricValue }));
            return (
              <Card key={roomName}>
                <CardHeader><CardTitle className="text-sm">{roomName} — 온도(℃) 추이</CardTitle></CardHeader>
                <CardContent className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="d" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip />
                      <Line type="monotone" dataKey="temp" name="온도(°C)" stroke="#ef4444" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>{l.interfaceCode}</span>
              <span className="flex-1 truncate px-3 text-muted-foreground">{l.message}</span>
              <span className={l.result === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}>{l.result}</span>
              <span className="ml-3 text-xs text-muted-foreground">{l.createdAt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
