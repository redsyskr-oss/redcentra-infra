'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2, Lock, Pencil, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTabStore } from '@/store/useTabStore';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { ApiRole, ApiUser, ROLE_META, UserRole } from './types';

/* ── 역할 관리 뷰 ── */
export function RoleManageView({ users }: { users: ApiUser[] }) {
  const queryClient = useQueryClient();
  const { openTab } = useTabStore();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [desc, setDesc] = useState('');

  const { data: roles = [], isLoading } = useQuery<ApiRole[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/roles');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const countByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
    return counts;
  }, [users]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const roleKey = (roleName: string) => roleName.replace(/^ROLE_/, '') as UserRole;

  function select(r: ApiRole) {
    setSelectedRoleId(r.id);
    setLabel(r.label);
    setDesc(r.roleDesc);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) return;
      const res = await apiFetch(`/api/v1/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, roleDesc: desc }),
      });
      if (!res.ok) throw new Error('저장 실패');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  const dirty = selectedRole ? (label !== selectedRole.label || desc !== selectedRole.roleDesc) : false;

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-5 pb-3 pt-4">
          <span className="text-[15px] font-semibold">역할 관리</span>
          <p className="mt-1 text-[11.5px] text-muted-foreground">역할별 인원 수와 설명을 관리합니다. 메뉴별 상세 접근 권한은 &quot;역할별 메뉴 권한 관리&quot;에서 설정합니다.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> 불러오는 중...
            </div>
          ) : (
            roles.map((r) => {
              const key = roleKey(r.roleName);
              const meta = ROLE_META[key];
              const locked = r.roleName === 'ROLE_SYSTEM_ADMIN';
              const isSelected = selectedRoleId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => select(r)}
                  className={cn(
                    'mb-1 flex cursor-pointer items-center gap-3.5 rounded-lg border px-3.5 py-2.5 transition-all',
                    isSelected ? 'border-primary/40 bg-accent' : 'border-transparent hover:bg-accent/50',
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta?.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      {r.label}
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.roleDesc}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                    {countByRole[key] ?? 0}명
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l">
        {selectedRole ? (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: ROLE_META[roleKey(selectedRole.roleName)]?.color + '1f', color: ROLE_META[roleKey(selectedRole.roleName)]?.color }}
              >
                {selectedRole.label}
              </span>
              {selectedRole.roleName === 'ROLE_SYSTEM_ADMIN' && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="h-3 w-3" /> 시스템 기본 역할</span>
              )}
              <span className="text-[11px] text-muted-foreground">{countByRole[roleKey(selectedRole.roleName)] ?? 0}명 배정됨</span>
            </div>

            <div className="space-y-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">표시 이름</div>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="space-y-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">설명</div>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[12px] outline-none"
              />
            </div>
            <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="mt-auto"
              onClick={() => openTab('SYS_MENU_ROLE', '역할별 메뉴 권한 관리')}
            >
              메뉴 접근 권한 설정 <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-[12px] leading-relaxed text-muted-foreground">
            역할을 선택하면
            <br />상세 정보가 표시됩니다
          </div>
        )}
      </div>
    </>
  );
}

