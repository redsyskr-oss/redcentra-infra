'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Lock, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

/* ── 보안 설정 뷰 ── */
export interface SecuritySettings {
  enforceAllowedIp: boolean;
  passwordMinLength: number;
  passwordExpireDays: number;
  sessionTimeoutMinutes: number;
  loginFailLockThreshold: number;
}

export function SecuritySettingsView() {
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

export function SecurityNumberField({
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

