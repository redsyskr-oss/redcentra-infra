# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 빌드 및 개발 명령어

패키지 매니저는 **pnpm**을 사용한다.

```bash
pnpm dev        # 개발 서버 실행
pnpm build      # 프로덕션 빌드
pnpm start      # 프로덕션 서버 실행
pnpm lint       # ESLint 실행
```

shadcn/ui 컴포넌트 추가 시:
```bash
pnpm dlx shadcn@latest add <component-name>
```

## 아키텍처

OS 데스크톱을 모방한 웹 애플리케이션이다. 사용자는 아이콘을 클릭하여 앱 창을 열고, 창을 드래그/리사이즈/최소화할 수 있다.

### 기술 스택

- **Next.js 16** (App Router, React Server Components)
- **React 19** + React Compiler (babel-plugin-react-compiler)
- **Tailwind CSS v4** (`@tailwindcss/postcss` 플러그인 방식, oklch 색상 공간 테마)
- **Zustand v5** (상태 관리)
- **react-rnd** (드래그/리사이즈 가능한 창)
- **shadcn/ui** (New York 스타일, Radix UI + CVA 기반)
- **iron-session** (세션 관리)

### 핵심 구조

- `src/app/page.tsx` — 데스크톱 화면. 아이콘 그리드와 WindowManager를 렌더링한다.
- `src/components/os/WindowManager.tsx` — 앱 레지스트리 패턴으로 열린 창들을 관리한다. 새 앱 추가 시 여기에 `dynamic(() => import(...))`로 등록한다.
- `src/components/os/WindowFrame.tsx` — react-rnd를 사용한 창 프레임. 타이틀바 드래그, 리사이즈, 최소화/복원/닫기 버튼을 제공한다.
- `src/components/os/Taskbar.tsx` — 하단 태스크바. 빠른 실행 버튼, 실행 중인 창 목록, 시계를 포함한다.
- `src/store/useWindowStore.ts` — Zustand 스토어. 창의 생성/삭제/포커스/최소화/위치·크기 업데이트를 관리한다. 모든 창 상태의 단일 진실 공급원(single source of truth)이다.
- `src/components/apps/` — 각 앱 컴포넌트가 위치한다 (예: `RackMap.tsx`).
- `src/components/ui/` — shadcn/ui로 생성된 UI 컴포넌트들. 직접 수정하지 않는다.
- `src/lib/utils.ts` — `cn()` 유틸리티 (clsx + tailwind-merge).

### 새 앱 추가 방법

1. `src/components/apps/`에 앱 컴포넌트를 생성한다.
2. `WindowManager.tsx`의 `Apps` 레지스트리에 `dynamic(() => import(...), { ssr: false })`로 등록한다.
3. `page.tsx`의 아이콘 그리드나 `Taskbar.tsx`의 빠른 실행 버튼에서 `useWindowStore`의 `openWindow(appId, title, data?)`를 호출한다.

### 환경 변수

`.env` 파일에 정의된다:
- `NEXT_PUBLIC_API_URL` — 클라이언트 측 API 호출 경로 (Next.js API 라우트 경유)
- `INTERNAL_BACKEND_URL` — 서버 측에서 백엔드에 직접 호출하는 경로

### 경로 별칭

`@/*`는 `./src/*`에 매핑된다 (tsconfig.json).
