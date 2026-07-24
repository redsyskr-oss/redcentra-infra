'use client';

import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Category } from './types';

export function CategoryNode({
  category,
  categories,
  selectedId,
  modelCount,
  onSelect,
  onEdit,
  depth = 0,
}: {
  category: Category;
  categories: Category[];
  selectedId: number | null;
  modelCount: Map<number, number>;
  onSelect: (id: number) => void;
  onEdit: (category: Category) => void;
  depth?: number;
}) {
  const children = categories.filter((item) => item.parentId === category.id);
  return (
    <div>
      <div
        className={cn(
          'group flex items-center rounded-lg pr-1 transition-colors hover:bg-slate-100',
          selectedId === category.id && 'bg-blue-50 text-blue-800',
        )}
      >
        <button
          onClick={() => onSelect(category.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left text-sm"
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
          {children.length > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <span className="w-3.5" />}
          <span className="truncate">{category.name}</span>
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{modelCount.get(category.id) ?? 0}</span>
        </button>
        <button
          className="ml-1 rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-slate-700 group-hover:opacity-100"
          onClick={() => onEdit(category)}
          title="분류 수정·삭제"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {children.map((child) => (
        <CategoryNode
          key={child.id}
          category={child}
          categories={categories}
          selectedId={selectedId}
          modelCount={modelCount}
          onSelect={onSelect}
          onEdit={onEdit}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
