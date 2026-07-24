'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown } from 'lucide-react';

type MemberType = 'INTERNAL' | 'PARTNER';

interface Company {
  companyId: number;
  companyName: string;
}

const POSITION_OPTIONS = [
  { value: 'STAFF', label: '사원' },
  { value: 'ASSISTANT_MANAGER', label: '대리' },
  { value: 'MANAGER', label: '과장' },
  { value: 'DEPUTY_GENERAL_MANAGER', label: '차장' },
  { value: 'GENERAL_MANAGER', label: '부장' },
  { value: 'DIRECTOR', label: '이사' },
  { value: 'PRESIDENT', label: '대표' },
];

const NO_COMPANY_VALUE = '__NONE__';

const inputClass =
  'bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500';

const selectClass =
  'h-9 w-full appearance-none rounded-md border border-slate-700 bg-slate-800/50 px-3 text-sm text-slate-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default function SignupPage() {
  const router = useRouter();

  const [userId, setUserId] = useState('');

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [userName, setUserName] = useState('');
  const [userMobile, setUserMobile] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [memberType, setMemberType] = useState<MemberType>('INTERNAL');

  const [department, setDepartment] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [position, setPosition] = useState('');
  const [extensionNumber, setExtensionNumber] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [requestedCompanyName, setRequestedCompanyName] = useState('');
  const [requestedBusinessNumber, setRequestedBusinessNumber] = useState('');
  const [requestedCompanyPhone, setRequestedCompanyPhone] = useState('');

  const [applyReason, setApplyReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (memberType !== 'PARTNER' || companies.length > 0) return;
    fetch('/api/auth/companies')
      .then((res) => res.json())
      .then((data) => setCompanies(data.companies ?? []))
      .catch(() => {});
  }, [memberType, companies.length]);

  const showCompanyNameInput =
    memberType === 'PARTNER' && companyId === NO_COMPANY_VALUE;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (password !== passwordConfirm) {
      setSubmitError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (password.length < 10) {
      setSubmitError('비밀번호는 10자 이상이어야 합니다.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setSubmitError('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.');
      return;
    }
    if (memberType === 'PARTNER' && !companyId) {
      setSubmitError('소속 업체를 선택해주세요.');
      return;
    }
    if (showCompanyNameInput && !requestedCompanyName) {
      setSubmitError('업체명을 입력해주세요.');
      return;
    }

    const payload =
      memberType === 'INTERNAL'
        ? {
            userId,
            password,
            userName,
            userMobile,
            userEmail,
            department,
            employeeNumber: employeeNumber || undefined,
            position: position || undefined,
            extensionNumber: extensionNumber || undefined,
            applyReason: applyReason || undefined,
          }
        : {
            userId,
            password,
            userName,
            userMobile,
            userEmail,
            companyId: showCompanyNameInput ? undefined : Number(companyId),
            requestedCompanyName: showCompanyNameInput
              ? requestedCompanyName
              : undefined,
            requestedBusinessNumber: showCompanyNameInput
              ? requestedBusinessNumber
              : undefined,
            requestedCompanyPhone: showCompanyNameInput
              ? requestedCompanyPhone
              : undefined,
            applyReason: applyReason || undefined,
          };

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.message || '가입 신청에 실패했습니다.');
        return;
      }
      setSubmitSuccess(true);
    } catch {
      setSubmitError('네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitSuccess) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-sm px-4 text-center">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10">
            <h1 className="text-lg font-semibold text-slate-100">
              가입 신청이 완료되었습니다
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              관리자 승인 후 이용 가능합니다.
            </p>
            <Button
              className="mt-6 w-full bg-blue-700 hover:bg-blue-600 text-white"
              onClick={() => router.push('/login')}
            >
              로그인 화면으로 이동
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-screen flex items-center justify-center bg-slate-950 py-10">
      <div className="w-full max-w-md px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-8">
          <h1 className="text-center text-xl font-semibold text-slate-100 mb-6">
            회원가입 신청
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userId" className="text-slate-300">
                아이디 *
              </Label>
              <Input
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="영문·숫자 4~20자"
                required
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
                  비밀번호 *
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="규칙: 길이·조합"
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm" className="text-slate-300">
                  비밀번호 확인 *
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="userName" className="text-slate-300">
                  이름 *
                </Label>
                <Input
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userMobile" className="text-slate-300">
                  연락처 *
                </Label>
                <Input
                  id="userMobile"
                  value={userMobile}
                  onChange={(e) => setUserMobile(e.target.value)}
                  placeholder="010-0000-0000"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="userEmail" className="text-slate-300">
                이메일 *
              </Label>
              <Input
                id="userEmail"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">가입 구분 *</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => setMemberType('INTERNAL')}
                  className={
                    memberType === 'INTERNAL'
                      ? 'bg-blue-700 hover:bg-blue-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }
                >
                  내부직원
                </Button>
                <Button
                  type="button"
                  onClick={() => setMemberType('PARTNER')}
                  className={
                    memberType === 'PARTNER'
                      ? 'bg-blue-700 hover:bg-blue-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }
                >
                  협력업체
                </Button>
              </div>
            </div>

            {memberType === 'INTERNAL' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="department" className="text-slate-300">
                      부서 *
                    </Label>
                    <Input
                      id="department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employeeNumber" className="text-slate-300">
                      사번
                    </Label>
                    <Input
                      id="employeeNumber"
                      value={employeeNumber}
                      onChange={(e) => setEmployeeNumber(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="position" className="text-slate-300">
                      직급
                    </Label>
                    <div className="relative">
                      <select
                        id="position"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className={selectClass}
                      >
                        <option value="" className="bg-slate-800">
                          선택하세요
                        </option>
                        {POSITION_OPTIONS.map((opt) => (
                          <option
                            key={opt.value}
                            value={opt.value}
                            className="bg-slate-800"
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extensionNumber" className="text-slate-300">
                      내선번호
                    </Label>
                    <Input
                      id="extensionNumber"
                      value={extensionNumber}
                      onChange={(e) => setExtensionNumber(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyId" className="text-slate-300">
                    소속 업체 *
                  </Label>
                  <div className="relative">
                    <select
                      id="companyId"
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                      required
                      className={selectClass}
                    >
                      <option value="" className="bg-slate-800">
                        업체를 선택하세요
                      </option>
                      {companies.map((c) => (
                        <option
                          key={c.companyId}
                          value={String(c.companyId)}
                          className="bg-slate-800"
                        >
                          {c.companyName}
                        </option>
                      ))}
                      <option value={NO_COMPANY_VALUE} className="bg-slate-800">
                        목록에 없음(직접 입력)
                      </option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>

                {showCompanyNameInput && (
                  <div className="space-y-2">
                    <Label htmlFor="requestedCompanyName" className="text-slate-300">
                      업체명 직접 입력
                    </Label>
                    <Input
                      id="requestedCompanyName"
                      value={requestedCompanyName}
                      onChange={(e) => setRequestedCompanyName(e.target.value)}
                      placeholder="업체명을 입력하세요"
                      required
                      className={inputClass}
                    />
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="requestedBusinessNumber"
                          className="text-slate-300"
                        >
                          사업자번호
                        </Label>
                        <Input
                          id="requestedBusinessNumber"
                          value={requestedBusinessNumber}
                          onChange={(e) =>
                            setRequestedBusinessNumber(e.target.value)
                          }
                          placeholder="000-00-00000"
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor="requestedCompanyPhone"
                          className="text-slate-300"
                        >
                          업체 연락처
                        </Label>
                        <Input
                          id="requestedCompanyPhone"
                          value={requestedCompanyPhone}
                          onChange={(e) =>
                            setRequestedCompanyPhone(e.target.value)
                          }
                          placeholder="000-000-0000"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-amber-400">
                      직접 입력한 업체는 관리자 승인 시 확인 후 등록됩니다
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="applyReason" className="text-slate-300">
                신청 사유
              </Label>
              <Input
                id="applyReason"
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                placeholder="선택 입력"
                className={inputClass}
              />
            </div>

            {submitError && (
              <div className="rounded-md border border-red-500/50 bg-red-950/40 px-4 py-2.5 text-center text-sm text-red-400">
                {submitError}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-700 hover:bg-blue-600 text-white"
            >
              {submitting ? '신청 중...' : '가입 신청'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              로그인 →
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
