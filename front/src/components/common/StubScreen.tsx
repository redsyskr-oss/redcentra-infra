'use client';

import { Construction } from 'lucide-react';

/**
 * 미구현 화면 자리표시 — 화면설계서 화면 ID(UI-XXX-000)로 기획-개발 추적.
 * 스텁 앱을 만들 때 이 컴포넌트를 사용해 어떤 설계서 화면에 대응하는지 명시한다.
 */
export function StubScreen({
  screenId,
  title,
  note,
}: {
  screenId: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Construction className="h-7 w-7 text-muted-foreground/50" />
      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
        {screenId}
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {note ?? '화면설계서 정의에 따라 구현 예정인 화면입니다.'}
      </p>
    </div>
  );
}
