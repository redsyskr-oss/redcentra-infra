'use client';

import { useTabStore } from '@/store/useTabStore';
import { MenuIcon } from '@/lib/icon-map';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ConsoleTabStrip() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabStore();

  return (
    <div
      className="h-[41px] flex-none bg-[#DDE3EC] flex items-end px-2.5 overflow-x-auto overflow-y-hidden no-scrollbar"
      role="tablist"
      aria-label="열린 화면 탭"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            onClick={() => activateTab(tab.id)}
            className={cn(
              'group relative h-[35px] min-w-[132px] max-w-[210px] flex-none flex items-center gap-2 rounded-t-[10px] px-2.5 pl-3.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
              isActive ? 'bg-[#F5F7FA] text-[#1B2536] z-[2]' : 'text-[#4A5A72] hover:bg-black/[.06]',
            )}
          >
            <MenuIcon name={tab.icon} className="h-[15px] w-[15px] flex-none" />
            <span className="overflow-hidden text-ellipsis">{tab.title}</span>
            <span
              role="button"
              title="탭 닫기"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-auto grid h-[18px] w-[18px] flex-none place-items-center rounded-full hover:bg-[#C62F2C] hover:[&>svg]:stroke-white"
            >
              <X className="h-[9px] w-[9px] stroke-[#8B99AE]" strokeWidth={1.6} />
            </span>
          </button>
        );
      })}
      {tabs.length === 0 && (
        <span className="self-center pb-2 text-xs text-[#8B99AE]">열린 탭이 없습니다</span>
      )}
    </div>
  );
}
