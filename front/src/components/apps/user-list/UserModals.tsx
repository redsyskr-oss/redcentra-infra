'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { ApiUser, ROLE_META, STATUS_LABEL, UserRole, UserStatus } from './types';

export interface CompanyOption {
  id: number;
  companyName: string;
}

export function EditUserModal({ user, onClose }: { user: ApiUser; onClose: () => void }) {
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
export function AddUserModal({ onClose }: { onClose: () => void }) {
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

export function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label className="h-4 text-xs font-medium leading-4 text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}
