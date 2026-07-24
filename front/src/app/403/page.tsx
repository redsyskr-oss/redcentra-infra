import { Ban } from 'lucide-react';

function formatNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default async function AccessBlockedPage({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string; time?: string; code?: string }>;
}) {
  const params = await searchParams;
  const ip = params.ip ?? '-';
  const time = params.time ?? formatNow();
  const code = params.code ?? 'ERR-IP-403';

  return (
    <main className="h-screen w-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm px-4 flex flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
          <Ban className="h-10 w-10 text-red-500" />
        </div>

        <h1 className="text-xl font-semibold text-slate-100">
          접근이 차단되었습니다
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          허용되지 않은 네트워크에서의 접속입니다.
          <br />
          시스템 관리자에게 문의해 주세요.
        </p>

        <div className="mt-6 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-left text-sm">
          <div className="flex justify-between py-1">
            <span className="text-slate-500">접속 IP</span>
            <span className="text-slate-200">{ip}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">일시</span>
            <span className="text-slate-200">{time}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">오류코드</span>
            <span className="text-slate-200">{code}</span>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          문의: 정보시스템팀 (내선 1234)
        </p>
      </div>
    </main>
  );
}
