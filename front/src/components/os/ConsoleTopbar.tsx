'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Menu, LogOut, User as UserIcon } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { UserInfo } from '@/store/useUserStore';
import { apiFetch } from '@/lib/api';

interface Props {
  user?: UserInfo;
  collapsed: boolean;
  onToggleSidebar: () => void;
}

export default function ConsoleTopbar({ user, collapsed, onToggleSidebar }: Props) {
  const router = useRouter();
  const [now, setNow] = useState('');

  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    update();
    const timer = setInterval(update, 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="h-12 flex-none bg-white flex items-center gap-2.5 pl-2.5 pr-4 border-b border-[#DFE5EE] z-30">
      <button
        title="메뉴 접기/펼치기"
        aria-label="메뉴 접기/펼치기"
        onClick={onToggleSidebar}
        className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F1F4F9]"
      >
        <Menu className="h-[19px] w-[19px] stroke-[#5B6B82]" />
      </button>

      <div className="flex items-baseline gap-2 select-none">
        <span className="text-[16.5px] font-black">
          <span className="text-[#C62F2C]">RED</span>
          <span className="text-[#1E5AA8]">SYS</span>
        </span>
        {!collapsed && (
          <span className="text-[11.5px] font-bold tracking-[.07em] text-[#8B99AE]">
            REDCENTRA DCIM
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 text-[12.5px] text-[#5B6B82]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(34,160,107,.12)] px-2.5 py-1 text-[11.5px] font-semibold text-[#1E7A52]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          허용 IP · 접속 이력 기록 중
        </span>
        <span className="hidden sm:inline">{now}</span>

        <Popover>
          <PopoverTrigger asChild>
            <button className="grid h-[27px] w-[27px] place-items-center rounded-full bg-gradient-to-br from-[#C62F2C] to-[#1E5AA8] text-[11px] font-extrabold text-white">
              {user?.name?.[0] ?? '관'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-56 p-1">
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
                <UserIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">{user?.name ?? '사용자'}</span>
                <span className="truncate text-xs text-muted-foreground">{user?.roles?.[0]}</span>
              </div>
            </div>
            <button onClick={() => router.push('/change-password')} className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"><KeyRound className="h-4 w-4" />비밀번호 변경</button>
            <button
              onClick={handleLogout}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
