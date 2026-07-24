'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * 메뉴 관리 — SYS_MENU
 * 화면설계서에는 이 화면의 와이어프레임이 없다(UI-SYS-004는 권한 매트릭스만 다룸).
 * `menu` 테이블 스키마(parentMenuId/menuCode/menuType/icon/sortOrder/isActive)를 기준으로
 * 메뉴 트리 CRUD 화면을 자체 설계했다.
 */
interface Menu {
  id: number;
  parentMenuId: number | null;
  menuCode: string;
  menuName: string;
  menuType: 'GROUP' | 'MODULE' | 'SUB';
  icon: string | null;
  windowTarget: string | null;
  sortOrder: number;
  isActive: boolean;
}

const CHILD_TYPE: Record<Menu['menuType'], Menu['menuType'] | null> = {
  GROUP: 'MODULE',
  MODULE: 'SUB',
  SUB: null,
};

function MenuRow({
  menu,
  menus,
  depth,
  onAddChild,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  menu: Menu;
  menus: Menu[];
  depth: number;
  onAddChild: (parent: Menu) => void;
  onEdit: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
  onToggleActive: (menu: Menu) => void;
}) {
  const children = menus.filter((m) => m.parentMenuId === menu.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const childType = CHILD_TYPE[menu.menuType];

  return (
    <>
      <div
        className={cn('flex items-center gap-2 border-b px-2 py-1.5 hover:bg-accent/40', !menu.isActive && 'opacity-50')}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <span className="w-14 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] text-muted-foreground">{menu.menuType}</span>
        <span className="text-sm font-medium">{menu.menuName}</span>
        <span className="text-xs text-muted-foreground">{menu.menuCode}</span>
        <div className="ml-auto flex items-center gap-1">
          {childType && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onAddChild(menu)} title="하위 메뉴 추가">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onToggleActive(menu)} title="활성/비활성">
            {menu.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(menu)} title="수정">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(menu)} title="삭제">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {children.map((c) => (
        <MenuRow key={c.id} menu={c} menus={menus} depth={depth + 1} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} />
      ))}
    </>
  );
}

export default function MenuManage({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formParent, setFormParent] = useState<Menu | null>(null);
  const [formTarget, setFormTarget] = useState<Menu | null>(null);

  const { data: menus = [] } = useQuery<Menu[]>({
    queryKey: ['menus-manage'],
    queryFn: async () => {
      const res = await fetch('/api/v1/menus');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['menus-manage'] });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Menu, 'id'>) => {
      const nextId = Math.max(0, ...menus.map((m) => m.id)) + 1;
      const res = await fetch('/api/v1/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: nextId, ...payload }),
      });
      if (!res.ok) throw new Error('생성에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => { invalidate(); setFormOpen(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Menu> }) => {
      const res = await fetch(`/api/v1/menus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('수정에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => { invalidate(); setFormOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/menus/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제에 실패했습니다.');
    },
    onSuccess: invalidate,
  });

  function handleDelete(menu: Menu) {
    const hasChildren = menus.some((m) => m.parentMenuId === menu.id);
    if (hasChildren) {
      alert('하위 메뉴가 있는 항목은 삭제할 수 없습니다. 먼저 하위 메뉴를 삭제하세요.');
      return;
    }
    if (confirm(`"${menu.menuName}" 메뉴를 삭제할까요?`)) deleteMutation.mutate(menu.id);
  }

  const roots = menus.filter((m) => m.parentMenuId === null).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex h-full flex-col p-4 gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">그룹 → 모듈 → 서브메뉴 순으로 구성됩니다. (자체 설계 화면 — 스펙 와이어프레임 없음)</p>
        <Button size="sm" onClick={() => { setFormMode('add'); setFormParent(null); setFormTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> 그룹 추가
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-md border">
        {roots.map((m) => (
          <MenuRow
            key={m.id}
            menu={m}
            menus={menus}
            depth={0}
            onAddChild={(parent) => { setFormMode('add'); setFormParent(parent); setFormTarget(null); setFormOpen(true); }}
            onEdit={(menu) => { setFormMode('edit'); setFormTarget(menu); setFormParent(null); setFormOpen(true); }}
            onDelete={handleDelete}
            onToggleActive={(menu) => updateMutation.mutate({ id: menu.id, patch: { isActive: !menu.isActive } })}
          />
        ))}
      </ScrollArea>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? '메뉴 추가' : '메뉴 수정'}</DialogTitle>
            <DialogDescription>
              {formParent ? `상위: ${formParent.menuName}` : formTarget ? `유형: ${formTarget.menuType}` : '최상위 그룹'}
            </DialogDescription>
          </DialogHeader>
          <MenuForm
            parent={formParent}
            target={formTarget}
            onSubmit={(payload) => {
              if (formMode === 'add') createMutation.mutate(payload);
              else if (formTarget) updateMutation.mutate({ id: formTarget.id, patch: payload });
            }}
            pending={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuForm({
  parent,
  target,
  onSubmit,
  pending,
}: {
  parent: Menu | null;
  target: Menu | null;
  onSubmit: (payload: Omit<Menu, 'id'>) => void;
  pending: boolean;
}) {
  const menuType: Menu['menuType'] = target?.menuType ?? (parent ? CHILD_TYPE[parent.menuType]! : 'GROUP');
  const [menuName, setMenuName] = useState(target?.menuName ?? '');
  const [menuCode, setMenuCode] = useState(target?.menuCode ?? '');
  const [sortOrder, setSortOrder] = useState(target?.sortOrder ?? 1);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          parentMenuId: parent?.id ?? target?.parentMenuId ?? null,
          menuCode,
          menuName,
          menuType,
          icon: target?.icon ?? null,
          windowTarget: target?.windowTarget ?? null,
          sortOrder,
          isActive: target?.isActive ?? true,
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-2">
        <Label>메뉴명 *</Label>
        <Input value={menuName} onChange={(e) => setMenuName(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>메뉴코드 * (예: SYS_ACCOUNT)</Label>
        <Input value={menuCode} onChange={(e) => setMenuCode(e.target.value.toUpperCase())} required />
      </div>
      <div className="grid gap-2">
        <Label>정렬순서</Label>
        <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>
      </DialogFooter>
    </form>
  );
}
