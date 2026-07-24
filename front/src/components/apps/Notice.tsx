'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, Plus, Trash2 } from 'lucide-react';
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
import { apiFetch } from '@/lib/api';

/** 공지사항 — UI-COM-003 */
interface Notice {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  postStart: string;
  postEnd: string;
  writerName: string;
  createdAt: string;
}

export default function Notice({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Notice | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: notices = [] } = useQuery<Notice[]>({
    queryKey: ['notices'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/notices');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Notice>) => {
      const res = await apiFetch('/api/v1/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, writerName: '김관리', createdAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('등록 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      setFormOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/v1/notices/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      setSelected(null);
    },
  });

  const sorted = [...notices].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">공지사항 ({notices.length})</span>
          <Button size="sm" variant="ghost" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {sorted.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelected(n)}
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left hover:bg-accent"
            >
              <span className="flex items-center gap-1 text-sm font-medium">
                {n.pinned && <Pin className="h-3 w-3 text-amber-500" />}
                {n.title}
              </span>
              <span className="text-[11px] text-muted-foreground">{n.postStart} ~ {n.postEnd} · {n.writerName}</span>
            </button>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 p-4">
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(selected.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.writerName} · 게시기간 {selected.postStart} ~ {selected.postEnd}
            </p>
            <p className="whitespace-pre-wrap text-sm">{selected.content}</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">공지를 선택하세요.</div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공지사항 등록</DialogTitle>
          </DialogHeader>
          <NoticeForm onSubmit={(payload) => createMutation.mutate(payload)} pending={createMutation.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoticeForm({ onSubmit, pending }: { onSubmit: (payload: Partial<Notice>) => void; pending: boolean }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [postStart, setPostStart] = useState(new Date().toISOString().slice(0, 10));
  const [postEnd, setPostEnd] = useState(new Date().toISOString().slice(0, 10));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ title, content, pinned, postStart, postEnd }); }}
      className="space-y-3"
    >
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
          <Label>게시 시작</Label>
          <Input type="date" value={postStart} onChange={(e) => setPostStart(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>게시 종료</Label>
          <Input type="date" value={postEnd} onChange={(e) => setPostEnd(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        상단 고정
      </label>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '등록 중...' : '등록'}</Button>
      </DialogFooter>
    </form>
  );
}
