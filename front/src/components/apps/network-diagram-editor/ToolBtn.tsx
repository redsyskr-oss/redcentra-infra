'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToolBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors',
        active ? 'border-[#35e0c8] bg-[#35e0c8] font-bold text-[#04211d]' : 'border-[#1d444c] bg-[#0f2b31] text-[#d8f3ef] hover:border-[#35e0c8] hover:text-[#35e0c8]',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
