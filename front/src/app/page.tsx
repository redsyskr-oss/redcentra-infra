'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import ConsoleTopbar from '@/components/os/ConsoleTopbar';
import ConsoleTabStrip from '@/components/os/ConsoleTabStrip';
import ConsoleSidebar from '@/components/os/ConsoleSidebar';
import TabContent from '@/components/os/TabContent';
import { useTabStore } from '@/store/useTabStore';

export default function Console() {
  const router = useRouter();
  const { data: user, isLoading } = useUser();
  const { tabs, openTab } = useTabStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (user?.mustChangePassword) router.replace('/change-password');
  }, [user?.mustChangePassword, router]);

  // 최초 진입 시 대시보드 탭 자동 오픈
  useEffect(() => {
    if (!isLoading && user && tabs.length === 0) {
      openTab('COM_DASHBOARD_MAIN', '대시보드', undefined, 'LayoutDashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  const menus = user?.menus ?? [];

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#F5F7FA] text-[#1B2536] flex flex-col">
      <ConsoleTopbar user={user} collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
      <ConsoleTabStrip />

      <div className="flex-1 min-h-0 flex bg-[#F5F7FA]">
        <ConsoleSidebar menus={menus} collapsed={collapsed} />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <TabContent />
        </div>
      </div>
    </main>
  );
}
