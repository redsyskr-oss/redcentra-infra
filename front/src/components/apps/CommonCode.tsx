'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/** 공통 코드 관리 — UI-SYS-003 */
interface CodeGroup {
  groupCode: string;
  groupName: string;
}

interface Code {
  id: number;
  groupCode: string;
  code: string;
  codeName: string;
  inUse: boolean;
  sortOrder: number;
}

export default function CommonCode({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: groups = [] } = useQuery<CodeGroup[]>({
    queryKey: ['commonCodeGroups'],
    queryFn: async () => {
      const res = await fetch('/api/v1/commonCodeGroups');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: codes = [] } = useQuery<Code[]>({
    queryKey: ['commonCodes'],
    queryFn: async () => {
      const res = await fetch('/api/v1/commonCodes');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (c: Code) => {
      const res = await fetch(`/api/v1/commonCodes/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inUse: !c.inUse }),
      });
      if (!res.ok) throw new Error('변경 실패');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commonCodes'] }),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Code, 'id'>) => {
      const nextId = Math.max(0, ...codes.map((c) => c.id)) + 1;
      const res = await fetch('/api/v1/commonCodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: nextId, ...payload }),
      });
      if (!res.ok) throw new Error('등록 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commonCodes'] });
      setFormOpen(false);
    },
  });

  const visibleCodes = selectedGroup ? codes.filter((c) => c.groupCode === selectedGroup).sort((a, b) => a.sortOrder - b.sortOrder) : [];

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 border-r">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">코드 그룹</div>
        <ScrollArea className="h-[calc(100%-33px)]">
          {groups.map((g) => (
            <button
              key={g.groupCode}
              onClick={() => setSelectedGroup(g.groupCode)}
              className={cn('flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left hover:bg-accent', selectedGroup === g.groupCode && 'bg-accent')}
            >
              <span className="text-sm font-medium">{g.groupName}</span>
              <span className="text-[11px] text-muted-foreground">{g.groupCode}</span>
            </button>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col">
        {!selectedGroup ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">좌측에서 코드 그룹을 선택하세요.</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-medium">{groups.find((g) => g.groupCode === selectedGroup)?.groupName}</span>
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> 코드 추가
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">코드</th>
                    <th className="px-3 py-2 text-left">코드명</th>
                    <th className="px-3 py-2 text-left">사용여부</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCodes.map((c) => (
                    <tr key={c.code} className="border-b">
                      <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-2">{c.codeName}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleMutation.mutate(c)}
                          className={cn('rounded px-2 py-0.5 text-xs', c.inUse ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}
                        >
                          {c.inUse ? '사용' : '미사용'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>코드 추가</DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <CodeForm
              groupCode={selectedGroup}
              nextSort={visibleCodes.length + 1}
              onSubmit={(payload) => createMutation.mutate(payload)}
              pending={createMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CodeForm({
  groupCode,
  nextSort,
  onSubmit,
  pending,
}: {
  groupCode: string;
  nextSort: number;
  onSubmit: (payload: Omit<Code, 'id'>) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState('');
  const [codeName, setCodeName] = useState('');

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ groupCode, code: code.toUpperCase(), codeName, inUse: true, sortOrder: nextSort }); }}
      className="space-y-3"
    >
      <div className="grid gap-2">
        <Label>코드 *</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>코드명 *</Label>
        <Input value={codeName} onChange={(e) => setCodeName(e.target.value)} required />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
      </DialogFooter>
    </form>
  );
}
