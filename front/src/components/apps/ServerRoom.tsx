'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTabStore } from '@/store/useTabStore';
import { Server, Plus, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

/* ─── 타입 정의 ─── */
interface Room {
  id: number;
  roomName: string;
  floor: number;
  gridWidth: number;
  gridHeight: number;
  totalGridCells: number;
}

interface RoomResponse {
  content: Room[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

function formatFloor(floor: number) {
  if (floor < 0) return `B${Math.abs(floor)}층`;
  return `${floor}층`;
}

export default function ServerRoom() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: async (): Promise<RoomResponse> => {
      const res = await fetch('/api/v1/rooms?page=1&size=100');
      if (!res.ok) throw new Error('Failed to fetch rooms');
      return res.json();
    },
  });

  const rooms = data?.content ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Server className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">서버실 로비</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          총 {data?.page.totalElements ?? 0}개 서버룸
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium">서버룸 목록을 불러오는 중...</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}

            <button
              onClick={() => setShowCreateModal(true)}
              className="group flex min-h-[212px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
                <Plus className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                새 서버룸
              </span>
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateRoomModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

/* ─── 룸 카드 컴포넌트 ─── */
function RoomCard({ room }: { room: Room }) {
  const { openTab } = useTabStore();

  function handleEnter() {
    openTab(`ROOM_VIEW_${room.id}`, room.roomName, { room });
  }

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-all hover:border-primary/50 hover:shadow-md">
      <div className="relative flex h-[110px] items-center justify-center bg-gradient-to-br from-[#123E78] to-[#1E5AA8]">
        <Server className="h-10 w-10 text-white/80 transition-transform group-hover:scale-110" />
        <span className="absolute right-2 top-2 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {formatFloor(room.floor)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="truncate text-sm font-semibold">{room.roomName}</h3>
        <div className="text-xs text-muted-foreground">
          {room.gridWidth} × {room.gridHeight} 그리드
        </div>
        <Button size="sm" className="mt-auto w-full" onClick={handleEnter}>
          <LogIn className="h-3.5 w-3.5" />
          입장
        </Button>
      </div>
    </Card>
  );
}

/* ─── 방 만들기 모달 ─── */
function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [roomName, setRoomName] = useState('');
  const [floor, setFloor] = useState(1);
  const [gridWidth, setGridWidth] = useState(10);
  const [gridHeight, setGridHeight] = useState(10);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, floor, gridWidth, gridHeight }),
      });
      if (!res.ok) throw new Error('Failed to create room');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>서버룸 생성</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>서버룸 명칭</Label>
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="서버룸 이름을 입력하세요"
            />
          </div>

          <div className="space-y-1.5">
            <Label>층</Label>
            <Input
              type="number"
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              placeholder="예: 1, 2, -1(B1)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>그리드 크기</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-normal text-muted-foreground">가로 (Width)</Label>
                <Input type="number" min={1} value={gridWidth} onChange={(e) => setGridWidth(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal text-muted-foreground">세로 (Height)</Label>
                <Input type="number" min={1} value={gridHeight} onChange={(e) => setGridHeight(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>취소</Button>
          <Button onClick={() => mutate()} disabled={isPending || !roomName.trim()}>
            {isPending ? '생성 중...' : '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
