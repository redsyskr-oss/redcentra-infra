'use client';

import { useState } from 'react';
import { useTabStore } from '@/store/useTabStore';
import { MenuIcon } from '@/lib/icon-map';
import type { MenuItem } from '@/store/useUserStore';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface Props {
  menus: MenuItem[];
  collapsed: boolean;
}

function MenuButton({ item, collapsed }: { item: MenuItem; collapsed: boolean }) {
  const { tabs, activeTabId, openTab } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isCurrent = activeTab?.appId === item.menuCode;

  return (
    <button
      title={item.menuName}
      onClick={() => openTab(item.menuCode, item.menuName, undefined, item.icon)}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-[13px] font-semibold text-left transition-colors whitespace-nowrap',
        collapsed ? 'justify-center px-0' : '',
        isCurrent
          ? 'bg-white/13 text-white shadow-[inset_3px_0_0_#FF6B66]'
          : 'text-[#B9C8E0] hover:bg-white/9 hover:text-white',
      )}
    >
      <MenuIcon
        name={item.icon}
        className={cn('h-[19px] w-[19px] shrink-0', isCurrent ? 'text-[#FF6B66]' : 'text-[#9FB4D4]')}
        strokeWidth={1.7}
      />
      {!collapsed && <span className="overflow-hidden text-ellipsis">{item.menuName}</span>}
    </button>
  );
}

export default function ConsoleSidebar({ menus, collapsed }: Props) {
  const rootPages = menus.filter((m) => m.menuType === 'PAGE');
  const categories = menus.filter((m) => m.menuType === 'CATEGORY');
  const [closedCats, setClosedCats] = useState<Set<number>>(new Set());

  function toggleCategory(id: number) {
    setClosedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav
      className={cn(
        'relative flex-none overflow-hidden flex flex-col transition-[width] duration-150 ease-in-out',
        'bg-gradient-to-b from-[#0C1B33] to-[#123E78]',
        collapsed ? 'w-16' : 'w-[236px]',
      )}
      aria-label="주 메뉴"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2.5 pb-3">
        {rootPages.length > 0 && (
          <div className="space-y-0.5 mb-1">
            {rootPages.map((item) => (
              <MenuButton key={item.id} item={item} collapsed={collapsed} />
            ))}
          </div>
        )}

        {categories.map((cat) => {
          const isOpen = collapsed || !closedCats.has(cat.id);
          return (
            <div key={cat.id}>
              {!collapsed && (
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 pt-3.5 pb-1.5 text-[10.5px] font-bold tracking-[.14em] text-[#7E93B8] hover:text-[#B9C8E0] whitespace-nowrap"
                >
                  <span>{cat.menuName}</span>
                  <ChevronDown
                    className={cn('h-3 w-3 shrink-0 transition-transform', !isOpen && '-rotate-90')}
                  />
                </button>
              )}
              {isOpen && (
                <div className="space-y-0.5">
                  {cat.children.map((child) => (
                    <MenuButton key={child.id} item={child} collapsed={collapsed} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          'relative z-10 flex-none border-t border-white/14 whitespace-nowrap',
          collapsed ? 'px-0 py-3 text-center' : 'px-3.5 py-3',
        )}
      >
        {!collapsed ? (
          <div className="text-[10.5px] tracking-[.03em] text-[#8AA1C4]">
            에이전트 상태 실시간 수신 중 · v1.0
          </div>
        ) : (
          <div className="text-xs text-[#35C48D]">●</div>
        )}
      </div>
    </nav>
  );
}
