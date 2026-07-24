'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
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

/** 예비부품 · 자재 — UI-MTN-002 */
interface SparePartRow {
  id: number;
  name: string;
  spec: string;
  stockQty: number;
  thresholdQty: number;
  location: string;
}

export default function SparePart({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [stockTarget, setStockTarget] = useState<{ part: SparePartRow; inOut: 'IN' | 'OUT' } | null>(null);

  const { data: parts = [] } = useQuery<SparePartRow[]>({
    queryKey: ['spareParts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/spareParts');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const stockMutation = useMutation({
    mutationFn: async ({ part, inOut, qty, reason }: { part: SparePartRow; inOut: 'IN' | 'OUT'; qty: number; reason: string }) => {
      const nextQty = inOut === 'IN' ? part.stockQty + qty : Math.max(0, part.stockQty - qty);
      await fetch(`/api/v1/spareParts/${part.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty: nextQty }),
      });
      await fetch('/api/v1/partStockHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partId: part.id, inOut, qty, reason, createdBy: 1, createdAt: new Date().toISOString() }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spareParts'] });
      setStockTarget(null);
    },
  });

  const columns: ColumnDef<SparePartRow, unknown>[] = [
    { accessorKey: 'name', header: '품목명' },
    { accessorKey: 'spec', header: '규격' },
    { accessorKey: 'location', header: '위치' },
    {
      accessorKey: 'stockQty',
      header: '재고 수량',
      cell: ({ row }) => {
        const low = row.original.stockQty < row.original.thresholdQty;
        return (
          <span className={cn('flex items-center gap-1', low && 'font-medium text-red-500')}>
            {low && <AlertTriangle className="h-3.5 w-3.5" />}
            {row.original.stockQty} (임계 {row.original.thresholdQty})
          </span>
        );
      },
    },
    {
      id: 'action',
      header: '입출고',
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setStockTarget({ part: row.original, inOut: 'IN' })}>
            <ArrowDownCircle className="mr-1 h-3.5 w-3.5" /> 입고
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStockTarget({ part: row.original, inOut: 'OUT' })}>
            <ArrowUpCircle className="mr-1 h-3.5 w-3.5" /> 출고
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Card className="min-h-0 flex-1 flex-col overflow-hidden py-0">
        <CardContent className="flex h-full min-h-0 flex-col overflow-hidden p-3">
          <DataTable columns={columns} data={parts} />
        </CardContent>
      </Card>

      <Dialog open={!!stockTarget} onOpenChange={(open) => !open && setStockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stockTarget?.part.name} — {stockTarget?.inOut === 'IN' ? '입고' : '출고'}</DialogTitle>
          </DialogHeader>
          {stockTarget && (
            <StockForm
              onSubmit={(qty, reason) => stockMutation.mutate({ part: stockTarget.part, inOut: stockTarget.inOut, qty, reason })}
              pending={stockMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StockForm({ onSubmit, pending }: { onSubmit: (qty: number, reason: string) => void; pending: boolean }) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(qty, reason); }} className="space-y-3">
      <div className="grid gap-2">
        <Label>수량 *</Label>
        <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
      </div>
      <div className="grid gap-2">
        <Label>사유</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '처리 중...' : '처리'}</Button>
      </DialogFooter>
    </form>
  );
}
