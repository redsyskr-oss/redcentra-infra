'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, Loader2, Plus, Search, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { useTabStore } from '@/store/useTabStore';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import {
  ApiUser, Approval, FILTER_TABS, FilterTab, ROLE_META, STATUS_DOT, STATUS_LABEL, UserRole,
} from './user-list/types';
import { RoleManageView } from './user-list/RoleManageView';
import { SecuritySettingsView } from './user-list/SecuritySettingsView';
import { DetailPanel } from './user-list/DetailPanel';
import { AddUserModal } from './user-list/UserModals';

/** 계정 · 권한 관리 — UI-SYS-001 (뷰/모달은 ./user-list 모듈로 분리) */
export default function UserList() {
  const { data: me } = useUser();
  const { openTab } = useTabStore();

  const [view, setView] = useState<'users' | 'roles' | 'security'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: users = [], isLoading } = useQuery<ApiUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });

  const { data: approvals = [] } = useQuery<Approval[]>({
    queryKey: ['userApprovals-full'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/userApprovals');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const pendingCount = useMemo(() => approvals.filter((a) => a.status === 'PENDING').length, [approvals]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (filterTab !== 'all' && u.status !== filterTab) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      const q = searchQuery.toLowerCase();
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) && !u.userId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, filterTab, roleFilter, searchQuery]);

  const roleCounts = useMemo(() => {
    const counts: Partial<Record<UserRole, number>> = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
    return counts;
  }, [users]);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;
  const selectedApproval = selectedUser
    ? approvals.find((a) => a.targetUserId === selectedUser.id && a.status === 'PENDING') ?? null
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        {/* ── 좌측 사이드바 ── */}
        <div className="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r bg-muted/30 py-4">
          <div className="mb-5 px-3">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">메뉴</div>
            <SideNavItem icon={<Users size={14} />} label="사용자 목록" badge={users.length} active={view === 'users'} onClick={() => setView('users')} />
            <SideNavItem icon={<ShieldCheck size={14} />} label="역할 관리" active={view === 'roles'} onClick={() => setView('roles')} />
            <SideNavItem
              icon={<Building2 size={14} />}
              label="회사 관리"
              onClick={() => openTab('SYS_COMPANY', '회사 관리', undefined, 'Building2')}
            />
            <SideNavItem
              icon={<ClipboardList size={14} />}
              label="접근 로그"
              onClick={() => openTab('SYS_ACCESS', '허용 IP · 접속 이력')}
            />
            <SideNavItem icon={<Settings size={14} />} label="보안 설정" active={view === 'security'} onClick={() => setView('security')} />
          </div>

          {view === 'users' && (
            <div className="px-3">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">역할별</div>
              {(Object.keys(ROLE_META) as UserRole[]).map((role) => {
                const meta = ROLE_META[role];
                const count = roleCounts[role] ?? 0;
                const active = roleFilter === role;
                return (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(active ? null : role)}
                    className={cn(
                      'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors',
                      active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="flex-1 truncate text-[11px]">{meta.label}</span>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {view === 'roles' ? (
          <RoleManageView users={users} />
        ) : view === 'security' ? (
          <SecuritySettingsView />
        ) : (
          <>
            {/* ── 중앙 콘텐츠 ── */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b px-5 pb-3 pt-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[15px] font-semibold">사용자 목록</span>
                  {pendingCount > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                      승인 대기 {pendingCount}건
                    </span>
                  )}
                  <Button size="sm" className="ml-auto" onClick={() => setShowModal(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> 사용자 추가
                  </Button>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3 py-1.5 focus-within:border-ring transition-colors">
                    <Search size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="이름 · 이메일 · ID 검색"
                      className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {FILTER_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-[12px] transition-colors',
                          filterTab === tab.key ? 'border-border bg-accent text-accent-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3">
                {isLoading ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={18} className="animate-spin" /> 불러오는 중...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                    <Search size={28} className="opacity-40" />
                    해당하는 사용자가 없습니다
                  </div>
                ) : (
                  filtered.map((u) => {
                    const role = ROLE_META[u.role];
                    const isSelected = selectedUserId === u.id;
                    const hasPending = approvals.some((a) => a.targetUserId === u.id && a.status === 'PENDING');
                    return (
                      <div
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={cn(
                          'mb-1 flex cursor-pointer items-center gap-3.5 rounded-lg border px-3.5 py-2.5 transition-all',
                          isSelected ? 'border-primary/40 bg-accent' : 'border-transparent hover:bg-accent/50',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[13px] font-medium">
                            {u.userId} <span className="text-muted-foreground">/ {u.name}</span>
                            {hasPending && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
                          </div>
                          <div className="truncate text-[11px]" style={{ color: role.color }}>{role.label}</div>
                        </div>
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: role.color + '1f', color: role.color }}>
                          {STATUS_LABEL[u.status]}
                        </span>
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[u.status])} title={STATUS_LABEL[u.status]} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── 우측 상세 패널 ── */}
            <div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l">
              {selectedUser ? (
                <DetailPanel
                  user={selectedUser}
                  approval={selectedApproval}
                  isSelf={me?.memberId === selectedUser.id}
                  onClose={() => setSelectedUserId(null)}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-[12px] leading-relaxed text-muted-foreground">
                  사용자를 선택하면
                  <br />상세 정보가 표시됩니다
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showModal && <AddUserModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

/* ── 사이드 네비 아이템 ── */
function SideNavItem({
  icon, label, badge, active = false, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
        onClick && 'cursor-pointer',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{badge}</span>}
    </div>
  );
}

