'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    if (newPassword.length < 10) { setError('새 비밀번호는 10자 이상이어야 합니다.'); return; }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) { setError('영문, 숫자, 특수문자를 모두 포함해 주세요.'); return; }
    setPending(true);
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? '비밀번호 변경에 실패했습니다.'); return; }
      router.replace('/'); router.refresh();
    } finally { setPending(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#E9EDF3] p-5"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-xl"><div className="mb-6 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#123E78]/10"><KeyRound className="h-5 w-5 text-[#123E78]" /></div><div><h1 className="text-lg font-bold">비밀번호 변경</h1><p className="text-xs text-muted-foreground">보안을 위해 새 비밀번호로 변경해 주세요.</p></div></div><div className="space-y-4"><div className="space-y-2"><Label>현재 또는 임시 비밀번호</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div><div className="space-y-2"><Label>새 비밀번호</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /><p className="text-[11px] text-muted-foreground">10자 이상, 영문·숫자·특수문자 포함</p></div><div className="space-y-2"><Label>새 비밀번호 확인</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div></div>{error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}<Button className="mt-6 w-full" disabled={pending}>{pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}비밀번호 변경</Button></form></main>;
}
