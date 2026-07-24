'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, KeyRound, Loader2, Lock, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { ApiUser, Approval, REQUEST_TYPE_LABEL, ROLE_META, STATUS_DOT, STATUS_LABEL, UserRole, UserStatus } from './types';
import { EditUserModal } from './UserModals';

/* ── 상세 패널 ── */
export function DetailPanel({
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

export function InfoField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] text-muted-foreground">{label}</div>
      {children ?? <div className="break-all text-[12px]">{value}</div>}
    </div>
  );
}

