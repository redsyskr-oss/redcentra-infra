'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, X, Users, ShieldCheck, ClipboardList, Settings, Check, Lock, ArrowRight, Building2, Pencil, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/hooks/useUser';
import { useTabStore } from '@/store/useTabStore';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/** 계정 · 권한 관리 — UI-SYS-001 */
type UserRole = 'SYSTEM_ADMIN' | 'RESIDENT_PL' | 'RESIDENT_ENGINEER' | 'PARTNER' | 'MANAGER' | 'USER' | 'VIEWER' | 'GUEST';
type UserStatus = 'ACTIVE' | 'PENDING' | 'LOCKED' | 'REJECTED' | 'INACTIVE';
type FilterTab = 'all' | 'ACTIVE' | 'PENDING' | 'LOCKED';

interface ApiUser {
  id: number;
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  employeeNumber: string | null;
  companyId?: number | null;
  department: string | null;
  position: string | null;
  role: UserRole;
  status: UserStatus;
  guestExpireAt: string | null;
  createdAt: string;
}

interface Approval {
  id: number;
  targetUserId: number;
  requestType: 'USER_REGISTRATION' | 'ACCOUNT_UNLOCK' | 'ROLE_CHANGE' | 'PERMISSION_GRANT' | 'TEMPORARY_ACCESS';
  requestReason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

interface ApiRole {
  id: number;
  roleName: string; // 'ROLE_SYSTEM_ADMIN' 형태 — UserRole enum에 'ROLE_' 접두사만 붙은 형태
  label: string;
  roleDesc: string;
}

/* ── 역할 메타 (배지 색상만 별도 지정, 그 외 UI는 앱 공통 톤을 따른다) ── */
const ROLE_META: Record<UserRole, { label: string; color: string }> = {
  SYSTEM_ADMIN: { label: '시스템 관리자', color: '#8b5cf6' },
  RESIDENT_PL: { label: '상주 PL', color: '#3b82f6' },
  RESIDENT_ENGINEER: { label: '상주 엔지니어', color: '#06b6d4' },
  PARTNER: { label: '파트너 업체', color: '#f59e0b' },
  MANAGER: { label: '매니저', color: '#10b981' },
  USER: { label: '일반 사용자', color: '#6b7280' },
  VIEWER: { label: '읽기 전용', color: '#64748b' },
  GUEST: { label: '임시 접근', color: '#ef4444' },
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: '활성', PENDING: '승인 대기', LOCKED: '잠금', REJECTED: '반려됨', INACTIVE: '비활성',
};
const STATUS_DOT: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-500', PENDING: 'bg-amber-500', LOCKED: 'bg-red-500', REJECTED: 'bg-muted-foreground', INACTIVE: 'bg-muted-foreground',
};
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'ACTIVE', label: '활성' },
  { key: 'PENDING', label: '대기' },
  { key: 'LOCKED', label: '잠금' },
];

const REQUEST_TYPE_LABEL: Record<Approval['requestType'], string> = {
  USER_REGISTRATION: '가입 승인',
  ACCOUNT_UNLOCK: '잠금 해제 승인',
  ROLE_CHANGE: '역할 변경 승인',
  PERMISSION_GRANT: '권한 부여 승인',
  TEMPORARY_ACCESS: '임시 접근 승인',
};

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

/* ── 역할 관리 뷰 ── */
function RoleManageView({ users }: { users: ApiUser[] }) {
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

/* ── 보안 설정 뷰 ── */
interface SecuritySettings {
  enforceAllowedIp: boolean;
  passwordMinLength: number;
  passwordExpireDays: number;
  sessionTimeoutMinutes: number;
  loginFailLockThreshold: number;
}

function SecuritySettingsView() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SecuritySettings | null>(null);

  const { data, isLoading } = useQuery<SecuritySettings>({
    queryKey: ['securitySettings'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/securitySettings');
      if (!res.ok) throw new Error('불러오기 실패');
      return res.json();
    },
  });

  const current = form ?? data ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const res = await apiFetch('/api/v1/securitySettings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('저장 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['securitySettings'] });
      setForm(null);
    },
  });

  const dirty = form !== null && data !== undefined && JSON.stringify(form) !== JSON.stringify(data);

  function patch(key: keyof SecuritySettings, value: SecuritySettings[typeof key]) {
    setForm({ ...(current as SecuritySettings), [key]: value });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-5 pb-3 pt-4">
        <span className="text-[15px] font-semibold">보안 설정</span>
        <p className="mt-1 text-[11.5px] text-muted-foreground">계정 접근·비밀번호·세션 관련 전역 정책을 관리합니다.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading || !current ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중...
          </div>
        ) : (
          <div className="max-w-md space-y-5">
            <div className="flex items-center justify-between rounded-lg border px-3.5 py-3">
              <div>
                <div className="text-[13px] font-medium">허용 IP 강제 적용</div>
                <div className="text-[11px] text-muted-foreground">활성화 시 등록된 허용 IP 외 접속을 차단합니다.</div>
              </div>
              <button
                onClick={() => patch('enforceAllowedIp', !current.enforceAllowedIp)}
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  current.enforceAllowedIp ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
                    current.enforceAllowedIp ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>

            <SecurityNumberField
              label="비밀번호 최소 길이"
              suffix="자"
              value={current.passwordMinLength}
              onChange={(v) => patch('passwordMinLength', v)}
            />
            <SecurityNumberField
              label="비밀번호 만료 주기"
              suffix="일"
              value={current.passwordExpireDays}
              onChange={(v) => patch('passwordExpireDays', v)}
            />
            <SecurityNumberField
              label="세션 자동 만료"
              suffix="분"
              value={current.sessionTimeoutMinutes}
              onChange={(v) => patch('sessionTimeoutMinutes', v)}
            />
            <SecurityNumberField
              label="로그인 실패 잠금 기준"
              suffix="회"
              value={current.loginFailLockThreshold}
              onChange={(v) => patch('loginFailLockThreshold', v)}
            />

            <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SecurityNumberField({
  label, suffix, value, onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3.5 py-3">
      <div className="text-[13px] font-medium">{label}</div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-20 text-right text-[12px]"
        />
        <span className="text-[11px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

/* ── 상세 패널 ── */
function DetailPanel({
  user, approval, isSelf, onClose,
}: {
  user: ApiUser;
  approval: Approval | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [pendingRole, setPendingRole] = useState<UserRole>(user.role);
  const [guestExpire, setGuestExpire] = useState(user.guestExpireAt?.slice(0, 10) ?? '');
  const [decideMode, setDecideMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [approveIp, setApproveIp] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['userApprovals-full'] });
    queryClient.invalidateQueries({ queryKey: ['userApprovals', 'pendingCount'] });
  };

  const patchUser = useMutation({
    mutationFn: async (patch: Partial<ApiUser>) => {
      const res = await apiFetch(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('수정 실패');
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/v1/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
    },
    onSuccess: () => { invalidateAll(); onClose(); },
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/auth/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: user.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '비밀번호 초기화에 실패했습니다.');
      return data.temporaryPassword as string;
    },
    onSuccess: (password) => setTemporaryPassword(password),
  });

  const decideMutation = useMutation({
    mutationFn: async ({ approve }: { approve: boolean }) => {
      if (!approval) return;
      await apiFetch(`/api/v1/userApprovals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: approve ? 'APPROVED' : 'REJECTED',
          approverId: 1,
          processComment: approve ? '' : rejectReason,
          processedAt: new Date().toISOString(),
        }),
      });

      if (approval.requestType === 'USER_REGISTRATION') {
        await apiFetch(`/api/v1/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: approve ? 'ACTIVE' : 'REJECTED', role: approve ? pendingRole : user.role }),
        });
        if (approve && approveIp.trim()) {
          await apiFetch('/api/v1/accessIps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: user.id, ipAddress: approveIp.trim(), description: `${user.name} 승인 시 등록` }),
          });
        }
      } else if (approval.requestType === 'ACCOUNT_UNLOCK') {
        await apiFetch(`/api/v1/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: approve ? 'ACTIVE' : 'LOCKED' }),
        });
      }
    },
    onSuccess: () => { invalidateAll(); setDecideMode('idle'); setApproveIp(''); setRejectReason(''); },
  });

  const role = ROLE_META[user.role];
  const canDowngradeOrDelete = !isSelf;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-col items-center gap-2">
        <div className="text-[14px] font-semibold">{user.name}</div>
        <div className="text-[11px] text-muted-foreground">{user.userId}</div>
        <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: role.color + '1f', color: role.color }}>
          {role.label}
        </span>
        {isSelf && <span className="text-[10px] text-muted-foreground">본인 계정 — 하향/삭제 불가</span>}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">기본 정보</div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-3 w-3" /> 회원정보 수정
          </Button>
        </div>
        <InfoField label="소속" value={user.department ?? '-'} />
        <InfoField label="사번" value={user.employeeNumber ?? '-'} />
        <InfoField label="연락처" value={user.mobile ?? '-'} />
        <InfoField label="이메일" value={user.email} />
        <InfoField label="상태">
          <span className="flex items-center gap-1.5 text-[12px]">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STATUS_DOT[user.status])} />
            {STATUS_LABEL[user.status]}
          </span>
        </InfoField>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">역할</div>
        <div className="flex items-center gap-2">
          <select
            value={pendingRole}
            onChange={(e) => setPendingRole(e.target.value as UserRole)}
            disabled={!canDowngradeOrDelete}
            className="h-8 flex-1 rounded-md border bg-transparent px-2 text-[12px] outline-none disabled:opacity-50"
          >
            {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_META[r].label}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!canDowngradeOrDelete || pendingRole === user.role || patchUser.isPending}
            onClick={() => patchUser.mutate({ role: pendingRole })}
          >
            변경
          </Button>
        </div>
      </div>

      {user.role === 'GUEST' && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">GUEST 만료일</div>
          <div className="flex items-center gap-2">
            <Input type="date" value={guestExpire} onChange={(e) => setGuestExpire(e.target.value)} className="h-8 text-[12px]" />
            <Button
              size="sm"
              variant="outline"
              disabled={patchUser.isPending || guestExpire === (user.guestExpireAt?.slice(0, 10) ?? '')}
              onClick={() => patchUser.mutate({ guestExpireAt: guestExpire ? new Date(guestExpire).toISOString() : null })}
            >
              저장
            </Button>
          </div>
        </div>
      )}

      {approval && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[11px] font-semibold text-amber-600">{REQUEST_TYPE_LABEL[approval.requestType]} 대기 중</div>
          <p className="text-[11px] text-muted-foreground">{approval.requestReason}</p>

          {decideMode === 'idle' && (
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" className="flex-1" onClick={() => setDecideMode('approve')}>
                <Check className="mr-1 h-3.5 w-3.5" /> 승인
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-destructive" onClick={() => setDecideMode('reject')}>
                <X className="mr-1 h-3.5 w-3.5" /> 반려
              </Button>
            </div>
          )}

          {decideMode === 'approve' && (
            <div className="space-y-2 pt-1">
              {approval.requestType === 'USER_REGISTRATION' && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">역할 지정</Label>
                    <select
                      value={pendingRole}
                      onChange={(e) => setPendingRole(e.target.value as UserRole)}
                      className="h-8 w-full rounded-md border bg-transparent px-2 text-[12px] outline-none"
                    >
                      {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_META[r].label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">허용 IP (선택)</Label>
                    <Input value={approveIp} onChange={(e) => setApproveIp(e.target.value)} placeholder="예: 203.0.113.10" className="h-8 text-[12px]" />
                  </div>
                </>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ approve: true })}>
                  {decideMutation.isPending ? '처리 중...' : '승인 확정'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecideMode('idle')}>취소</Button>
              </div>
            </div>
          )}

          {decideMode === 'reject' && (
            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">반려 사유 (필수)</Label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-transparent px-2 py-1.5 text-[12px] outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={decideMutation.isPending || !rejectReason.trim()}
                  onClick={() => decideMutation.mutate({ approve: false })}
                >
                  {decideMutation.isPending ? '처리 중...' : '반려 확정'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecideMode('idle')}>취소</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5 pt-2">
        <Button size="sm" variant="outline" disabled={resetPassword.isPending} onClick={() => { if (confirm(`${user.name} 사용자의 비밀번호를 초기화할까요?`)) resetPassword.mutate(); }}><KeyRound className="mr-1 h-3.5 w-3.5" />비밀번호 초기화</Button>
        {user.status === 'LOCKED' && (
          <Button size="sm" variant="outline" disabled={patchUser.isPending} onClick={() => patchUser.mutate({ status: 'ACTIVE' })}>
            잠금 해제
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10"
          disabled={!canDowngradeOrDelete || deleteUser.isPending}
          onClick={() => { if (confirm(`${user.name} 계정을 삭제할까요?`)) deleteUser.mutate(); }}
        >
          사용자 삭제
        </Button>
      </div>

      {editOpen && <EditUserModal user={user} onClose={() => setEditOpen(false)} />}
      {temporaryPassword && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl"><h2 className="font-semibold">임시 비밀번호 발급 완료</h2><p className="mt-2 text-xs text-muted-foreground">이 비밀번호는 지금 한 번만 표시됩니다. 사용자에게 안전한 방법으로 전달하세요.</p><div className="mt-4 select-all rounded-lg border bg-muted p-3 text-center font-mono text-lg font-bold tracking-wider">{temporaryPassword}</div><p className="mt-3 text-xs text-amber-600">사용자는 다음 로그인 시 비밀번호를 반드시 변경해야 합니다.</p><Button className="mt-5 w-full" onClick={() => setTemporaryPassword(null)}>확인</Button></div></div>}
    </div>
  );
}

function InfoField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>
      {children ?? <div className="break-all text-[12px]">{value}</div>}
    </div>
  );
}

interface CompanyOption {
  id: number;
  companyName: string;
}

function EditUserModal({ user, onClose }: { user: ApiUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState(user.mobile ?? '');
  const [department, setDepartment] = useState(user.department ?? '');
  const [employeeNumber, setEmployeeNumber] = useState(user.employeeNumber ?? '');
  const [position, setPosition] = useState(user.position ?? '');
  const [companyId, setCompanyId] = useState(user.companyId == null ? '' : String(user.companyId));
  const [error, setError] = useState<string | null>(null);

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ['companies-admin'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies');
      return res.ok ? res.json() : [];
    },
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim() || null,
          department: department.trim() || null,
          employeeNumber: employeeNumber.trim() || null,
          position: position.trim() || null,
          companyId: companyId ? Number(companyId) : null,
        }),
      });
      if (!res.ok) throw new Error('회원정보 수정에 실패했습니다.');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['users-company-count'] });
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : '회원정보 수정에 실패했습니다.'),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="w-full max-w-[520px] rounded-xl border bg-card p-6 text-card-foreground shadow-xl"
        onSubmit={(e) => { e.preventDefault(); setError(null); updateUser.mutate(); }}
      >
        <div className="mb-5 flex items-start justify-between">
          <div><h2 className="text-base font-semibold">회원정보 수정</h2><p className="mt-1 text-xs text-muted-foreground">아이디를 제외한 회원 기본정보를 변경합니다.</p></div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <div className="grid gap-1.5"><Label htmlFor="edit-name">이름 *</Label><Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} /></div>
          <div className="grid gap-1.5"><Label>아이디</Label><Input value={user.userId} disabled /></div>
          <div className="col-span-2 grid gap-1.5"><Label htmlFor="edit-email">이메일 *</Label><Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-mobile">연락처</Label><Input id="edit-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="010-0000-0000" /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-employee">사번</Label><Input id="edit-employee" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-department">부서</Label><Input id="edit-department" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-position">직급</Label><Input id="edit-position" value={position} onChange={(e) => setPosition(e.target.value)} /></div>
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="edit-company">소속 회사</Label>
            <select id="edit-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus:border-ring">
              <option value="">소속 없음</option>
              {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.companyName}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={updateUser.isPending || !name.trim() || !email.trim()}>
            {updateUser.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}저장
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── 사용자 추가 모달 ── */
function AddUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<UserRole>('USER');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [memberType, setMemberType] = useState<'INTERNAL' | 'PARTNER'>('INTERNAL');
  const [department, setDepartment] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [position, setPosition] = useState('');
  const [extensionNumber, setExtensionNumber] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [applyReason, setApplyReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ['companies-admin'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies');
      return res.ok ? res.json() : [];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (password !== passwordConfirm) throw new Error('비밀번호가 일치하지 않습니다.');
      if (memberType === 'PARTNER' && !companyId) throw new Error('소속 회사를 선택해 주세요.');
      let resolvedCompanyId: number | null = companyId && companyId !== 'NEW' ? Number(companyId) : null;
      if (memberType === 'PARTNER' && companyId === 'NEW') {
        if (!newCompanyName.trim()) throw new Error('회사명을 입력해 주세요.');
        const companyRes = await apiFetch('/api/v1/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: newCompanyName.trim(), businessNumber: businessNumber.trim() || null, phone: companyPhone.trim() || null }),
        });
        if (!companyRes.ok) throw new Error('회사 등록에 실패했습니다.');
        const company = await companyRes.json();
        resolvedCompanyId = Number(company.id);
      }
      const res = await apiFetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), userId: userId.trim(), email: email.trim(), mobile: mobile.trim(),
          role, status, userPassword: password, companyId: memberType === 'PARTNER' ? resolvedCompanyId : null,
          department: memberType === 'INTERNAL' ? department.trim() : (companies.find((company) => company.id === resolvedCompanyId)?.companyName ?? newCompanyName.trim()),
          employeeNumber: memberType === 'INTERNAL' ? employeeNumber.trim() || null : null,
          position: memberType === 'INTERNAL' ? position || null : null,
          extensionNumber: memberType === 'INTERNAL' ? extensionNumber.trim() || null : null,
          applyReason: applyReason.trim() || null,
          createdAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error('사용자 추가에 실패했습니다.');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
      onClose();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : '사용자 추가에 실패했습니다.'),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-xl">
        <div className="mb-5 flex items-start justify-between"><div><h2 className="text-base font-semibold">새 사용자 추가</h2><p className="mt-1 text-xs text-muted-foreground">회원가입과 동일한 기본정보를 입력하고 역할과 상태를 지정합니다.</p></div><Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>

        <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <FormGroup label="이름 *"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormGroup>
          <FormGroup label="아이디 *"><Input value={userId} onChange={(e) => setUserId(e.target.value)} /></FormGroup>
          <FormGroup label="이메일 *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormGroup>
          <FormGroup label="휴대전화 *"><Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="010-0000-0000" /></FormGroup>
          <FormGroup label="임시 비밀번호 *"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormGroup>
          <FormGroup label="비밀번호 확인 *"><Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} /></FormGroup>
        </div>

        <div className="pb-2">
          <FormGroup label="회원 구분 *"><div className="grid grid-cols-2 gap-3"><Button type="button" className="h-9" variant={memberType === 'INTERNAL' ? 'default' : 'outline'} onClick={() => setMemberType('INTERNAL')}>내부 직원</Button><Button type="button" className="h-9" variant={memberType === 'PARTNER' ? 'default' : 'outline'} onClick={() => setMemberType('PARTNER')}>협력업체</Button></div></FormGroup>
        </div>

        {memberType === 'INTERNAL' ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 pb-2">
            <FormGroup label="부서 *"><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></FormGroup>
            <FormGroup label="사번"><Input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} /></FormGroup>
            <FormGroup label="직급"><Input value={position} onChange={(e) => setPosition(e.target.value)} /></FormGroup>
            <FormGroup label="내선번호"><Input value={extensionNumber} onChange={(e) => setExtensionNumber(e.target.value)} /></FormGroup>
          </div>
        ) : (
          <>
            <FormGroup label="소속 회사 *"><select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-2.5 text-sm"><option value="">회사를 선택하세요</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.companyName}</option>)}<option value="NEW">목록에 없음(직접 등록)</option></select></FormGroup>
            {companyId === 'NEW' && <div className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-lg border bg-muted/20 p-4"><div className="col-span-2"><FormGroup label="회사명 *"><Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} /></FormGroup></div><FormGroup label="사업자번호"><Input value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} /></FormGroup><FormGroup label="회사 전화번호"><Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} /></FormGroup></div>}
          </>
        )}

        <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-t pt-6">
          <FormGroup label="역할 *"><select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="h-9 w-full rounded-md border bg-transparent px-2.5 text-sm">{(Object.keys(ROLE_META) as UserRole[]).map((item) => <option key={item} value={item}>{ROLE_META[item].label}</option>)}</select></FormGroup>
          <FormGroup label="계정 상태 *"><select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} className="h-9 w-full rounded-md border bg-transparent px-2.5 text-sm">{(['ACTIVE', 'PENDING', 'INACTIVE', 'LOCKED', 'REJECTED'] as UserStatus[]).map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select></FormGroup>
        </div>
        <div className="pt-1"><FormGroup label="신청 사유"><Input value={applyReason} onChange={(e) => setApplyReason(e.target.value)} /></FormGroup></div>
        </div>
        {error && <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mt-7 flex items-center justify-end gap-3 border-t pt-5"><Button className="h-9 min-w-24" variant="outline" onClick={onClose}>취소</Button><Button className="h-9 min-w-28" disabled={isPending || !name.trim() || !userId.trim() || !email.trim() || !mobile.trim() || !password || !passwordConfirm || (memberType === 'INTERNAL' && !department.trim())} onClick={() => { setError(null); mutate(); }}>{isPending ? '저장 중...' : '사용자 추가'}</Button></div>
      </div>
    </div>
  );
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label className="h-4 text-xs font-medium leading-4 text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}
