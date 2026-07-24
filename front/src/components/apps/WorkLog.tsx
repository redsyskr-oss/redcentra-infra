'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Wrench, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/common/DataTable';
import { Card, CardContent } from '@/components/ui/card';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from '@/lib/utils';

/**
 * 장애 · 작업 관리 — UI-MTN-001
 * 스펙상 장애(FAULT)/작업(WORK)은 동일 화면(maintenance_task, kind로 구분)이므로
 * 기존 WorkLog/IncidentList 두 스텁을 이 화면 하나로 병합했다.
 */
interface Task {
  id: number;
  kind: 'FAULT' | 'WORK';
  title: string;
  content: string;
  deviceName: string | null;
  occurredAt: string;
  assigneeName: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'DONE';
  actionNote: string | null;
}

const COLUMNS: { id: Task['status']; label: string }[] = [
  { id: 'RECEIVED', label: '접수' },
  { id: 'IN_PROGRESS', label: '진행' },
  { id: 'DONE', label: '완료' },
];

const KIND_META = {
  FAULT: { label: '장애', icon: AlertTriangle, className: 'bg-red-500/10 text-red-600' },
  WORK: { label: '작업', icon: Wrench, className: 'bg-blue-500/10 text-blue-600' },
};

export default function WorkLog({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [actionNote, setActionNote] = useState('');

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['maintenanceTasks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/maintenanceTasks');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, actionNote }: { id: number; status: Task['status']; actionNote?: string }) => {
      const res = await fetch(`/api/v1/maintenanceTasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionNote !== undefined ? { status, actionNote } : { status }),
      });
      if (!res.ok) throw new Error('상태 변경에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
      setCompletingTask(null);
      setActionNote('');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Task>) => {
      const res = await fetch('/api/v1/maintenanceTasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'RECEIVED', actionNote: null, createdAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('등록에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
      setRegisterOpen(false);
    },
  });

  function handleDrop(e: React.DragEvent, status: Task['status']) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;

    if (status === 'DONE') {
      setCompletingTask(task);
      return;
    }
    statusMutation.mutate({ id, status });
  }

  const columns: ColumnDef<Task, unknown>[] = [
    { accessorKey: 'kind', header: '구분', cell: (c) => KIND_META[c.getValue<Task['kind']>()].label },
    { accessorKey: 'title', header: '제목' },
    { accessorKey: 'deviceName', header: '대상 장비' },
    { accessorKey: 'occurredAt', header: '일시' },
    { accessorKey: 'assigneeName', header: '담당자' },
    { accessorKey: 'status', header: '상태', cell: (c) => COLUMNS.find((col) => col.id === c.getValue())?.label },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border">
          <button
            onClick={() => setView('kanban')}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-sm', view === 'kanban' ? 'bg-accent font-medium' : 'text-muted-foreground')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> 칸반보드
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('flex items-center gap-1 border-l px-3 py-1.5 text-sm', view === 'list' ? 'bg-accent font-medium' : 'text-muted-foreground')}
          >
            <List className="h-3.5 w-3.5" /> 목록형
          </button>
        </div>
        <Button className="ml-auto" onClick={() => setRegisterOpen(true)}>+ 등록</Button>
      </div>

      {view === 'kanban' ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
              className="flex flex-col rounded-lg border bg-muted/20 min-h-0"
            >
              <div className="border-b px-3 py-2 text-sm font-medium">
                {col.label} <span className="text-muted-foreground">({tasks.filter((t) => t.status === col.id).length})</span>
              </div>
              <div className="flex-1 space-y-2 overflow-auto p-2">
                {tasks.filter((t) => t.status === col.id).map((task) => {
                  const meta = KIND_META[task.kind];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(task.id))}
                      className="cursor-grab rounded-md border bg-background p-2.5 shadow-sm active:cursor-grabbing"
                    >
                      <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', meta.className)}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <div className="mt-1.5 text-sm font-medium">{task.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {task.deviceName ?? '-'} · {task.occurredAt} · {task.assigneeName}
                      </div>
                      {task.status === 'DONE' && task.actionNote && (
                        <div className="mt-1.5 rounded bg-emerald-500/10 px-1.5 py-1 text-[11px] text-emerald-700">
                          {task.actionNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
          <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
            <DataTable columns={columns} data={tasks} />
          </CardContent>
        </Card>
      )}

      {/* 완료 전환 — 조치내용 필수 */}
      <Dialog open={!!completingTask} onOpenChange={(open) => !open && setCompletingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>완료 처리 — {completingTask?.title}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!completingTask || !actionNote.trim()) return;
              statusMutation.mutate({ id: completingTask.id, status: 'DONE', actionNote });
            }}
            className="space-y-3"
          >
            <div className="grid gap-2">
              <Label>조치내용 *</Label>
              <Input value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="완료 처리를 위해 조치내용을 입력하세요" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={statusMutation.isPending}>완료 처리</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 등록 */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>장애 · 작업 등록</DialogTitle>
          </DialogHeader>
          <RegisterForm onSubmit={(payload) => createMutation.mutate(payload)} pending={createMutation.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegisterForm({ onSubmit, pending }: { onSubmit: (payload: Partial<Task>) => void; pending: boolean }) {
  const [kind, setKind] = useState<Task['kind']>('FAULT');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [assigneeName, setAssigneeName] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ kind, title, content, deviceName: deviceName || null, assigneeName, occurredAt: new Date().toISOString() });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-2">
        {(['FAULT', 'WORK'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn('rounded-md border py-1.5 text-sm', kind === k ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground')}
          >
            {KIND_META[k].label}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label>제목 *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>내용</Label>
        <Input value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>대상 장비</Label>
          <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="예: A01-SRV01" />
        </div>
        <div className="grid gap-2">
          <Label>담당자 *</Label>
          <Input value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} required />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '등록 중...' : '등록'}</Button>
      </DialogFooter>
    </form>
  );
}
