'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/** 역할별 메뉴 권한 관리 — UI-SYS-004 */
interface Role {
  id: number;
  roleName: string;
  label: string;
}

interface Menu {
  id: number;
  parentMenuId: number | null;
  menuCode: string;
  menuName: string;
  menuType: 'GROUP' | 'MODULE' | 'SUB';
  sortOrder: number;
  isActive: boolean;
}

interface MenuRole {
  id: number;
  menuId: number;
  roleId: number;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

type Perm = { canRead: boolean; canWrite: boolean; canDelete: boolean };

export default function PermissionManage({ data: _data }: { data?: unknown }) {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [localPerm, setLocalPerm] = useState<Map<number, Perm>>(new Map());
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [copyFromOpen, setCopyFromOpen] = useState(false);

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/roles');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: menus = [] } = useQuery<Menu[]>({
    queryKey: ['menus-admin'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/menus');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: menuRoles = [] } = useQuery<MenuRole[]>({
    queryKey: ['menuRoles-admin'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/menuRoles');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const isLocked = selectedRole?.roleName === 'ROLE_SYSTEM_ADMIN';

  const permByMenuIdForRole = useMemo(() => {
    const m = new Map<number, MenuRole>();
    for (const mr of menuRoles) {
      if (mr.roleId === selectedRoleId) m.set(mr.menuId, mr);
    }
    return m;
  }, [menuRoles, selectedRoleId]);

  // 역할 변경(또는 menus/menuRoles 비동기 로딩 완료) 시 로컬 상태 초기화.
  // useEffect 대신 렌더 중 상태 조정 패턴을 쓴다
  // (React 공식 권장: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [prevSelectedRoleId, setPrevSelectedRoleId] = useState(selectedRoleId);
  const [prevMenus, setPrevMenus] = useState(menus);
  const [prevPermByMenuId, setPrevPermByMenuId] = useState(permByMenuIdForRole);
  if (selectedRoleId !== prevSelectedRoleId || menus !== prevMenus || permByMenuIdForRole !== prevPermByMenuId) {
    setPrevSelectedRoleId(selectedRoleId);
    setPrevMenus(menus);
    setPrevPermByMenuId(permByMenuIdForRole);
    if (selectedRoleId) {
      const next = new Map<number, Perm>();
      for (const m of menus.filter((x) => x.menuType === 'SUB')) {
        const p = permByMenuIdForRole.get(m.id);
        next.set(m.id, { canRead: p?.canRead ?? false, canWrite: p?.canWrite ?? false, canDelete: p?.canDelete ?? false });
      }
      setLocalPerm(next);
      setDirty(new Set());
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const menuId of dirty) {
        const perm = localPerm.get(menuId);
        const record = permByMenuIdForRole.get(menuId);
        if (!perm || !record) continue;
        await apiFetch(`/api/v1/menuRoles/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(perm),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuRoles-admin'] });
      setDirty(new Set());
    },
  });

  function setPerm(menuId: number, patch: Partial<Perm>) {
    if (isLocked) return;
    setLocalPerm((prev) => {
      const next = new Map(prev);
      const current = next.get(menuId) ?? { canRead: false, canWrite: false, canDelete: false };
      const merged = { ...current, ...patch };
      // W ⇒ R 자동, R 해제 ⇒ W/D 자동 해제
      if (patch.canWrite) merged.canRead = true;
      if (patch.canRead === false) { merged.canWrite = false; merged.canDelete = false; }
      if (patch.canDelete) merged.canRead = true;
      next.set(menuId, merged);
      return next;
    });
    setDirty((prev) => new Set(prev).add(menuId));
  }

  function copyFromRole(sourceRoleId: number) {
    const next = new Map<number, Perm>();
    const dirtyNext = new Set<number>();
    for (const m of menus.filter((x) => x.menuType === 'SUB')) {
      const src = menuRoles.find((mr) => mr.roleId === sourceRoleId && mr.menuId === m.id);
      next.set(m.id, { canRead: src?.canRead ?? false, canWrite: src?.canWrite ?? false, canDelete: src?.canDelete ?? false });
      dirtyNext.add(m.id);
    }
    setLocalPerm(next);
    setDirty(dirtyNext);
    setCopyFromOpen(false);
  }

  const groups = menus.filter((m) => m.menuType === 'GROUP').sort((a, b) => a.sortOrder - b.sortOrder);
  const modules = menus.filter((m) => m.menuType === 'MODULE').sort((a, b) => a.sortOrder - b.sortOrder);
  const subs = menus.filter((m) => m.menuType === 'SUB').sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">역할</div>
        <ScrollArea className="h-[calc(100%-33px)]">
          {roles.map((r) => {
            const locked = r.roleName === 'ROLE_SYSTEM_ADMIN';
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRoleId(r.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm border-b hover:bg-accent',
                  selectedRoleId === r.id && 'bg-accent font-medium',
                )}
              >
                {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                {r.label}
              </button>
            );
          })}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selectedRole ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">좌측에서 역할을 선택하세요.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <span className="font-semibold">{selectedRole.label}</span>
              {isLocked && <span className="text-xs text-muted-foreground">(관리자 역할은 항상 전체 권한이며 잠겨 있습니다)</span>}
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCopyFromOpen(true)} disabled={isLocked}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> 다른 역할에서 복사
                </Button>
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={isLocked || dirty.size === 0 || saveMutation.isPending}>
                  변경사항 저장{dirty.size > 0 ? ` (${dirty.size}건)` : ''}
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">메뉴</th>
                    <th className="w-16 px-2 py-2 text-center">조회(R)</th>
                    <th className="w-24 px-2 py-2 text-center">등록·수정(W)</th>
                    <th className="w-16 px-2 py-2 text-center">삭제(D)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const groupModules = modules.filter((m) => m.parentMenuId === g.id);
                    if (groupModules.length === 0) return null;
                    return (
                      <Fragment key={g.id}>
                        <tr className="bg-muted/30">
                          <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{g.menuName}</td>
                        </tr>
                        {groupModules.map((mod) => {
                          const modSubs = subs.filter((s) => s.parentMenuId === mod.id);
                          return (
                            <Fragment key={mod.id}>
                              {modSubs.length > 1 && (
                                <tr className="border-b">
                                  <td className="px-3 py-1.5 pl-6 text-xs text-muted-foreground">{mod.menuName}</td>
                                  <td colSpan={3} />
                                </tr>
                              )}
                              {modSubs.map((sub) => {
                                const perm = localPerm.get(sub.id) ?? { canRead: false, canWrite: false, canDelete: false };
                                return (
                                  <tr key={sub.id} className="border-b hover:bg-accent/30">
                                    <td className="px-3 py-1.5 pl-10">{sub.menuName}</td>
                                    <td className="text-center">
                                      <input type="checkbox" disabled={isLocked} checked={isLocked || perm.canRead} onChange={(e) => setPerm(sub.id, { canRead: e.target.checked })} />
                                    </td>
                                    <td className="text-center">
                                      <input type="checkbox" disabled={isLocked} checked={isLocked || perm.canWrite} onChange={(e) => setPerm(sub.id, { canWrite: e.target.checked })} />
                                    </td>
                                    <td className="text-center">
                                      <input type="checkbox" disabled={isLocked} checked={isLocked || perm.canDelete} onChange={(e) => setPerm(sub.id, { canDelete: e.target.checked })} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </>
        )}
      </div>

      {copyFromOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCopyFromOpen(false)}>
          <div className="w-72 rounded-lg border bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-sm font-medium">복사할 역할 선택</div>
            <div className="space-y-1">
              {roles.filter((r) => r.id !== selectedRoleId).map((r) => (
                <button
                  key={r.id}
                  onClick={() => copyFromRole(r.id)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
