'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, ExternalLink, Loader2, Server } from 'lucide-react';
import { useTabStore } from '@/store/useTabStore';
import RoomView from './RoomView';

interface Room {
  id: number;
  roomName: string;
  floor: number;
  gridWidth: number;
  gridHeight: number;
}

interface RoomResponse {
  content: Room[];
}

const SELECTED_ROOM_KEY = 'redcentra.dashboard.selectedRoom.v1';

export default function DashboardRoomWidget() {
  const { openTab } = useTabStore();
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const { data, isLoading } = useQuery<RoomResponse>({
    queryKey: ['rooms'],
    queryFn: async () => {
      const res = await fetch('/api/v1/rooms?page=1&size=100');
      if (!res.ok) throw new Error('서버실 목록을 불러오지 못했습니다.');
      return res.json();
    },
  });

  const rooms = useMemo(() => data?.content ?? [], [data]);

  useEffect(() => {
    if (rooms.length === 0) return;
    const savedId = Number(window.localStorage.getItem(SELECTED_ROOM_KEY));
    const initial = rooms.find((room) => room.id === savedId) ?? rooms[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRoomId((current) => current ?? initial.id);
  }, [rooms]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;

  function selectRoom(id: number) {
    setSelectedRoomId(id);
    window.localStorage.setItem(SELECTED_ROOM_KEY, String(id));
  }

  if (isLoading) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" />서버실을 불러오는 중...</div>;
  }

  if (!selectedRoom) {
    return <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400"><Server className="h-8 w-8 opacity-50" />등록된 서버실이 없습니다.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0c1930] px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300"><Box className="h-4 w-4" />서버실 랙 3D 배치</div>
        <label htmlFor="dashboard-room" className="ml-auto text-[11px] text-slate-400">서버실 선택</label>
        <select
          id="dashboard-room"
          value={selectedRoom.id}
          onChange={(event) => selectRoom(Number(event.target.value))}
          className="h-8 min-w-[190px] rounded-md border border-white/15 bg-[#14233d] px-2.5 text-xs text-slate-100 outline-none focus:border-cyan-300"
        >
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName} · {room.floor < 0 ? `B${Math.abs(room.floor)}` : `${room.floor}층`}</option>)}
        </select>
        <button
          onClick={() => openTab(`ROOM_VIEW_${selectedRoom.id}`, selectedRoom.roomName, { room: selectedRoom }, 'Server')}
          className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
        >
          <ExternalLink className="h-3.5 w-3.5" />전체 화면
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-background text-foreground">
        <RoomView key={selectedRoom.id} data={{ room: selectedRoom }} dashboardMode />
      </div>
    </div>
  );
}
