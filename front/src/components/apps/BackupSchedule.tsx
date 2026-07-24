'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { Search } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 백업관리 — UI-BKP-001(구성 목록) · UI-BKP-002(주간 스케줄 캘린더) */
interface BackupRow {
  id: number;
  rackName: string;
  deviceName: string;
  hostName: string;
  bizName: string;
  osVersion: string;
  backupIp: string;
  backupType: string;
  backupSystem: string;
  capacity: string;
}

interface BackupScheduleRow {
  id: number;
  backupConfigId: number;
  deviceName: string;
  dayOfWeek: string;
  runTime: string;
}

const columns: ColumnDef<BackupRow, unknown>[] = [
  { accessorKey: 'rackName', header: 'RACK' },
  { accessorKey: 'deviceName', header: '장비명' },
  { accessorKey: 'hostName', header: '호스트명' },
  { accessorKey: 'bizName', header: '업무명' },
  { accessorKey: 'osVersion', header: 'OS' },
  { accessorKey: 'backupIp', header: 'Backup IP' },
  { accessorKey: 'backupType', header: '유형' },
  { accessorKey: 'backupSystem', header: '시스템' },
  { accessorKey: 'capacity', header: '용량' },
];

/** 이번 주 기준 요일+시각을 실제 Date로 변환 (DAILY는 매일 표시) */
const DOW_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
function toEventDates(dayOfWeek: string, runTime: string) {
  const [h, m] = runTime.split(':').map(Number);
  const days = dayOfWeek === 'DAILY' ? [0, 1, 2, 3, 4, 5, 6] : [DOW_INDEX[dayOfWeek] ?? 0];
  return days.map((dow) => {
    const t = new Date();
    t.setDate(t.getDate() - t.getDay() + dow);
    t.setHours(h, m, 0, 0);
    const end = new Date(t);
    end.setHours(h + 1);
    return { start: t, end };
  });
}

const EVENT_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#0d9488', '#f59e0b'];

const TABS = [
  { id: 'list', label: '구성 목록' },
  { id: 'schedule', label: '스케줄 현황' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function BackupSchedule({ data }: { data?: { initialTab?: TabId } }) {
  const [tab, setTab] = useState<TabId>(data?.initialTab ?? 'list');
  const [keyword, setKeyword] = useState('');

  const { data: rows = [] } = useQuery<BackupRow[]>({
    queryKey: ['backups'],
    queryFn: async () => {
      const res = await fetch('/api/v1/backups');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: schedules = [] } = useQuery<BackupScheduleRow[]>({
    queryKey: ['backupSchedules'],
    queryFn: async () => {
      const res = await fetch('/api/v1/backupSchedules');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: tab === 'schedule',
  });

  const filtered = rows.filter(
    (r) => r.deviceName.includes(keyword) || r.hostName.includes(keyword) || r.bizName.includes(keyword),
  );

  const events = schedules.flatMap((s, i) =>
    toEventDates(s.dayOfWeek, s.runTime).map(({ start, end }) => ({
      title: s.deviceName,
      start,
      end,
      color: EVENT_COLORS[i % EVENT_COLORS.length],
    })),
  );

  return (
    <div className="flex h-full flex-col">
      {/* 창 내부 탭 — 시작 메뉴 하위 메뉴명과 동일하게 유지 */}
      <div className="flex shrink-0 gap-1 border-b px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
              tab === t.id
                ? 'border-border border-b-background bg-background font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="장비명 · 호스트명 · 업무명 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button variant="outline" className="ml-auto">
              백업 구성 등록
            </Button>
          </div>
          <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
            <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
              <DataTable columns={columns} data={filtered} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'schedule' && (
        <div className="min-h-0 flex-1 p-4">
          <FullCalendar
            plugins={[timeGridPlugin, dayGridPlugin]}
            initialView="timeGridWeek"
            locale="ko"
            height="100%"
            allDaySlot={false}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'timeGridWeek,dayGridMonth',
            }}
            events={events}
          />
        </div>
      )}
    </div>
  );
}
