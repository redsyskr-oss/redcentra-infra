'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** 반출입 관리 — UI-IOM-001 (신청 → 승인 → 완료/반려) */
interface CarryInOutRow {
  id: number;
  deviceId: number;
  deviceName: string;
  kind: 'IN' | 'OUT' | 'EVACUATION';
  reason: string;
  plannedDate: string;
  requesterName: string;
  approverName: string | null;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DONE';
  decisionNote: string | null;
}

const KIND_LABEL: Record<CarryInOutRow['kind'], string> = { IN: '반입', OUT: '반출', EVACUATION: '긴급대피' };
const STATUS_LABEL: Record<CarryInOutRow['status'], string> = { REQUESTED: '신청', APPROVED: '승인', REJECTED: '반려', DONE: '완료' };
const STATUS_COLOR: Record<CarryInOutRow['status'], string> = {
  REQUESTED: 'text-amber-500', APPROVED: 'text-blue-500', REJECTED: 'text-red-500', DONE: 'text-emerald-600',
};

export default function CarryInOut({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data: rows = [] } = useQuery<CarryInOutRow[]>({
    queryKey: ['carryInOuts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/carryInOuts');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      const note = window.prompt(approve ? '승인 메모(선택)' : '반려 사유') ?? '';
      const res = await fetch(`/api/v1/carryInOuts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: approve ? 'APPROVED' : 'REJECTED', approverName: '김관리', decisionNote: note }),
      });
      if (!res.ok) throw new Error('처리 실패');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carryInOuts'] }),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/carryInOuts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
      });
      if (!res.ok) throw new Error('완료 처리 실패');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carryInOuts'] }),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<CarryInOutRow>) => {
      const res = await fetch('/api/v1/carryInOuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'REQUESTED', requesterName: '김관리', approverName: null, decisionNote: null, createdAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('신청 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carryInOuts'] });
      setRegisterOpen(false);
    },
  });

  const columns: ColumnDef<CarryInOutRow, unknown>[] = [
    { accessorKey: 'kind', header: '구분', cell: (c) => KIND_LABEL[c.getValue<CarryInOutRow['kind']>()] },
    { accessorKey: 'deviceName', header: '대상 장비' },
    { accessorKey: 'reason', header: '사유' },
    { accessorKey: 'plannedDate', header: '예정일' },
    { accessorKey: 'requesterName', header: '신청자' },
    {
      accessorKey: 'status',
      header: '상태',
      cell: (c) => <span className={STATUS_COLOR[c.getValue<CarryInOutRow['status']>()]}>{STATUS_LABEL[c.getValue<CarryInOutRow['status']>()]}</span>,
    },
    {
      id: 'action',
      header: '처리',
      cell: ({ row }) => {
        const r = row.original;
        if (r.status === 'REQUESTED') {
          return (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => decideMutation.mutate({ id: r.id, approve: true })}>승인</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => decideMutation.mutate({ id: r.id, approve: false })}>반려</Button>
            </div>
          );
        }
        if (r.status === 'APPROVED') {
          return <Button size="sm" variant="outline" onClick={() => completeMutation.mutate(r.id)}>완료 처리</Button>;
        }
        return <span className="text-xs text-muted-foreground">{r.decisionNote ?? '-'}</span>;
      },
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center">
        <Button className="ml-auto" onClick={() => setRegisterOpen(true)}>+ 반출입 신청</Button>
      </div>
      <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
        <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
          <DataTable columns={columns} data={rows} />
        </CardContent>
      </Card>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반출입 신청</DialogTitle>
          </DialogHeader>
          <RegisterForm onSubmit={(payload) => createMutation.mutate(payload)} pending={createMutation.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegisterForm({ onSubmit, pending }: { onSubmit: (payload: Partial<CarryInOutRow>) => void; pending: boolean }) {
  const [kind, setKind] = useState<CarryInOutRow['kind']>('OUT');
  const [deviceName, setDeviceName] = useState('');
  const [reason, setReason] = useState('');
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ kind, deviceName, reason, plannedDate }); }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-2">
        {(['IN', 'OUT', 'EVACUATION'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn('rounded-md border py-1.5 text-sm', kind === k ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground')}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label>대상 장비 *</Label>
        <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>사유 *</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>예정일</Label>
        <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '신청 중...' : '신청'}</Button>
      </DialogFooter>
    </form>
  );
}
