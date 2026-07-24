'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Search } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface AccessIp {
  id: number;
  memberId: number | null;
  ipAddress: string;
  description: string;
}

interface AccessHistory {
  id: number;
  loginId: string;
  ip: string;
  success: boolean;
  blockReason: string | null;
  accessedAt: string;
}

const TABS = [
  { id: 'ip', label: '허용 IP 목록' },
  { id: 'history', label: '접속 이력' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function AuditLog({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('history');
  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [editingIp, setEditingIp] = useState<AccessIp | null>(null);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [description, setDescription] = useState('');
  const [memberId, setMemberId] = useState('');
  const [formError, setFormError] = useState('');

  const { data: ips = [] } = useQuery<AccessIp[]>({
    queryKey: ['accessIps'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/accessIps');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: history = [] } = useQuery<AccessHistory[]>({
    queryKey: ['accessHistory'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/accessHistory');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const openIpDialog = (ip?: AccessIp) => {
    setEditingIp(ip ?? null);
    setIpAddress(ip?.ipAddress ?? '');
    setDescription(ip?.description ?? '');
    setMemberId(ip?.memberId == null ? '' : String(ip.memberId));
    setFormError('');
    setIpDialogOpen(true);
  };

  const saveIp = useMutation({
    mutationFn: async () => {
      const normalizedIp = ipAddress.trim();
      if (!normalizedIp) throw new Error('IP 주소 또는 CIDR을 입력해 주세요.');
      if (memberId.trim() && !/^\d+$/.test(memberId.trim())) {
        throw new Error('적용 사용자 ID는 숫자로 입력해 주세요.');
      }
      const res = await fetch(editingIp ? `/api/v1/accessIps/${editingIp.id}` : '/api/v1/accessIps', {
        method: editingIp ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipAddress: normalizedIp,
          description: description.trim(),
          memberId: memberId.trim() ? Number(memberId.trim()) : null,
        }),
      });
      if (!res.ok) throw new Error(editingIp ? '허용 IP 수정에 실패했습니다.' : '허용 IP 등록에 실패했습니다.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accessIps'] });
      setIpDialogOpen(false);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : '저장에 실패했습니다.'),
  });

  const filteredHistory = history.filter((item) => {
    const matchesKeyword = !keyword || item.loginId.includes(keyword) || item.ip.includes(keyword);
    const matchesResult = !resultFilter || (resultFilter === 'SUCCESS' ? item.success : !item.success);
    return matchesKeyword && matchesResult;
  });

  const ipColumns: ColumnDef<AccessIp, unknown>[] = [
    { accessorKey: 'ipAddress', header: 'IP / 대역' },
    { accessorKey: 'description', header: '설명', cell: (cell) => cell.getValue() || '-' },
    { accessorKey: 'memberId', header: '적용 대상', cell: (cell) => (cell.getValue() ? `사용자 #${cell.getValue()}` : '전체') },
    {
      id: 'actions',
      header: '관리',
      cell: ({ row }) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={(event) => { event.stopPropagation(); openIpDialog(row.original); }}
        >
          <Pencil className="h-3 w-3" />
          수정
        </Button>
      ),
    },
  ];

  const historyColumns: ColumnDef<AccessHistory, unknown>[] = [
    { accessorKey: 'accessedAt', header: '일시' },
    { accessorKey: 'loginId', header: '계정' },
    { accessorKey: 'ip', header: 'IP' },
    {
      accessorKey: 'success',
      header: '결과',
      cell: (cell) => (
        <span className={cell.getValue() ? 'text-emerald-600' : 'text-red-500'}>
          {cell.getValue() ? '성공' : '실패'}
        </span>
      ),
    },
    { accessorKey: 'blockReason', header: '차단 · 실패 사유', cell: (cell) => cell.getValue() ?? '-' },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex gap-1 border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px rounded-t-md border px-3 py-1.5 text-sm transition-colors',
              tab === item.id
                ? 'border-border border-b-background bg-background font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'ip' ? (
        <>
          <div className="flex items-center justify-end">
            <Button type="button" className="gap-1.5" onClick={() => openIpDialog()}>
              <Plus className="h-4 w-4" />
              허용 IP 등록
            </Button>
          </div>
          <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
            <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
              <DataTable columns={ipColumns} data={ips} emptyMessage="등록된 허용 IP가 없습니다." />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="계정 · IP 검색" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </div>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
              <option value="">전체 결과</option>
              <option value="SUCCESS">성공</option>
              <option value="FAIL">실패</option>
            </select>
            <Button variant="outline" className="ml-auto">CSV 저장</Button>
          </div>
          <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
            <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
              <DataTable columns={historyColumns} data={filteredHistory} />
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={ipDialogOpen} onOpenChange={(open) => { if (!saveIp.isPending) setIpDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIp ? '허용 IP 수정' : '허용 IP 등록'}</DialogTitle>
            <DialogDescription>단일 IP 또는 CIDR 대역을 입력하고 적용 범위를 지정합니다.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="access-ip-address">IP 주소 / CIDR *</Label>
              <Input id="access-ip-address" value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} placeholder="예: 192.168.0.10 또는 192.168.0.0/24" autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="access-ip-description">설명</Label>
              <Input id="access-ip-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 본청 내부망" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="access-ip-member">적용 사용자 ID (선택)</Label>
              <Input id="access-ip-member" inputMode="numeric" value={memberId} onChange={(event) => setMemberId(event.target.value)} placeholder="비워 두면 전체 사용자에게 적용" />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIpDialogOpen(false)} disabled={saveIp.isPending}>취소</Button>
            <Button type="button" onClick={() => { setFormError(''); saveIp.mutate(); }} disabled={saveIp.isPending}>
              {saveIp.isPending ? '저장 중...' : editingIp ? '수정 저장' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
