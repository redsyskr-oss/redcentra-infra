'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const data = await res.json();
      router.push(data.mustChangePassword ? '/change-password' : '/');
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-screen bg-[#E9EDF3] flex items-center justify-center p-5">
      <div className="w-full max-w-[1080px] rounded-[14px] overflow-hidden shadow-[0_14px_40px_rgba(11,23,40,.16)] border border-[#D8DEE8] grid grid-cols-1 lg:grid-cols-[46%_54%] min-h-[640px]">
        {/* 좌측 브랜드 패널 */}
        <div className="relative overflow-hidden text-white flex flex-col p-10 lg:p-14 bg-gradient-to-br from-[#0C1B33] via-[#123E78] to-[#1E5AA8]">
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)',
              backgroundSize: '44px 44px',
            }}
          />

          <div className="relative z-10">
            <div className="text-3xl lg:text-[40px] font-black tracking-tight">
              <span className="text-[#FF6B66]">RED</span>
              <span className="text-[#8FB9F2]">SYS</span>
            </div>
            <div className="mt-2.5 text-[13px] tracking-[.22em] font-semibold text-[#9FB4D4]">
              REDCENTRA · DCIM
            </div>
          </div>

          <div className="relative z-10 my-auto py-10">
            <svg
              width="340"
              height="90"
              viewBox="0 0 340 90"
              className="block max-w-full animate-pulse-draw"
              aria-hidden="true"
            >
              <path
                d="M0 52 H96 L118 14 L142 78 L160 52 H236 L246 52 M258 52 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M286 52 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0"
                fill="none"
                stroke="#FF7A75"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-2 text-[14.5px] leading-[1.7] text-[#C6D4EA]">
              전산실의 심장 박동을 하나의 콘솔에서.
              <br />
              랙 · IT 자산 · 전력 · 환경을 실시간으로 관제합니다.
            </p>
          </div>

          <div className="relative z-10 mt-8 pt-4.5 border-t border-white/16 flex flex-wrap gap-5 text-[11.5px] tracking-[.04em] text-[#8AA1C4]">
            <span>RedCentra v1.0</span>
            <span>REDSYS Co., Ltd.</span>
            <span className="animate-beat-pulse">● 17 에이전트 수신 중</span>
          </div>
        </div>

        {/* 우측 폼 패널 */}
        <div className="bg-white px-8 py-12 lg:px-16 lg:py-16 flex flex-col justify-center">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#F0F7F3] px-3 py-1.5 text-xs text-[#1E7A52] mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22A06B] shadow-[0_0_0_3px_rgba(34,160,107,.18)]" />
            허용 IP 네트워크에서 접속 중입니다
          </span>

          <h1 className="text-[23px] font-extrabold tracking-tight text-[#1B2536]">
            관리 콘솔 로그인
          </h1>
          <p className="mt-2 mb-7 text-[13.5px] text-[#5B6B82]">
            계정 권한(ACL)에 따라 접근 가능한 메뉴가 표시됩니다.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="userId" className="text-[#1B2536]">
                사용자 ID
              </Label>
              <Input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="아이디를 입력하세요"
                required
                autoFocus
                className="h-11 bg-[#FAFBFD] border-[#D8DEE8] text-[#1B2536] placeholder:text-[#A4AFC0] focus-visible:border-[#1E5AA8] focus-visible:ring-[#1E5AA8]/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#1B2536]">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="h-11 bg-[#FAFBFD] border-[#D8DEE8] text-[#1B2536] placeholder:text-[#A4AFC0] focus-visible:border-[#1E5AA8] focus-visible:ring-[#1E5AA8]/20"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11.5 bg-[#C62F2C] hover:bg-[#A32320] text-white font-bold text-[15px]"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </Button>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-center text-sm text-[#A32320]">
                {error}
              </div>
            )}
          </form>

          <div className="mt-6 flex justify-between text-[12.5px] text-[#5B6B82]">
            <span>계정이 없으신가요?</span>
            <Link href="/signup" className="font-semibold text-[#1E5AA8] hover:text-[#123E78]">
              관리자에게 계정 요청 →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
