# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 빌드 및 개발 명령어

패키지 매니저는 **pnpm**을 사용한다.

```bash
pnpm dev        # 개발 서버 실행 (포트 9000)
pnpm server     # json-server 목업 백엔드 실행 (포트 4000, server/db.json)
pnpm dev:all    # 위 둘을 동시에 실행
pnpm build      # 프로덕션 빌드
pnpm lint       # ESLint 실행
```

목업 데이터를 다시 생성하려면 `node server/seed.mjs` → `server/db.json` 재생성 후 목업 서버를 재시작한다 (`--watch`를 쓰지 않으므로 수동 재시작 필요).

shadcn/ui 컴포넌트 추가 시:
```bash
pnpm dlx shadcn@latest add <component-name>
```

## 아키텍처

DCIM(전산실 관제) 웹 콘솔이다. 로그인 후 좌측 사이드바 메뉴를 클릭하면 상단 탭 스트립에 탭이 열리고, 탭 단위로 앱 화면이 전환된다 (브라우저 탭이 아닌 앱 내부 탭).

### 기술 스택

- **Next.js 16** (App Router, React Server Components)
- **React 19** + React Compiler (babel-plugin-react-compiler)
- **Tailwind CSS v4** (`@tailwindcss/postcss` 플러그인 방식)
- **Zustand v5** (탭 상태 관리)
- **TanStack Query v5** (서버 상태) — 일부 화면은 아직 생 `fetch` 사용
- **shadcn/ui** (New York 스타일, Radix UI + CVA 기반)
- **three.js / @react-three/fiber** (RoomView 3D 뷰), **@xyflow/react** (구성도 에디터), **recharts** (차트)

### 핵심 구조

- `src/app/page.tsx` — 메인 콘솔. Topbar + TabStrip + Sidebar + TabContent를 조립한다.
- `src/components/os/ConsoleSidebar.tsx` — 메뉴 트리. 클릭 시 `useTabStore.openTab(menuCode, ...)` 호출.
- `src/components/os/ConsoleTabStrip.tsx` — 열린 탭 목록/전환/닫기.
- `src/components/os/TabContent.tsx` — **앱 레지스트리**. `menuCode`를 키로 각 앱 컴포넌트를 `dynamic(() => import(...))`로 등록한다. 탭의 appId를 이 레지스트리에서 해석해 렌더링한다.
- `src/store/useTabStore.ts` — Zustand 스토어. 탭 열기(동일 appId 싱글톤)/닫기/활성화, 최대 8개 초과 시 오래된 탭 자동 닫기.
- `src/hooks/useUser.ts` — `/api/auth/me` 조회 + `filterReadable`로 canRead 메뉴만 필터링.
- `src/components/apps/` — 각 앱 화면 컴포넌트 (Dashboard, RoomView, UserList 등).
- `src/components/ui/` — shadcn/ui 생성 컴포넌트. 직접 수정하지 않는다.

### API 계층 (목업 ↔ 실 백엔드 전환 구조)

- `src/app/api/[...path]/route.ts` — 범용 프록시. 목업 모드면 json-server로, 아니면 `INTERNAL_BACKEND_URL`로 전달한다. `auth/me`는 목업 모드에서 특별 처리(메뉴/권한 조합). 목업 토큰(`mock.<memberId>`) 검증 후 통과시킨다.
- `src/app/api/auth/*` — 로그인/가입/비밀번호 변경 등. 각 라우트가 `isMockApi()`로 목업/실백엔드 분기.
- `src/app/api/v1/**` — json-server가 처리 못 하는 조합 로직(랙 상세 조합, 장비 배치, 엑셀 일괄 등록)용 전용 라우트. **catch-all보다 우선 매칭되므로 각자 인증 가드를 가져야 한다.**
- `src/lib/mock/jsonServerClient.ts` — json-server 호출 헬퍼. id 타입 정규화(`normalizeIds`), 민감 필드 제거(`stripSensitive`, `userPassword` 등), Spring pageable ↔ json-server 페이지네이션 변환을 담당한다.
- `src/lib/mock/authService.ts` — 목업 인증/메뉴 트리 조합.
- `server/mock-server.cjs` — json-server 0.17.4 래퍼 (lodash-id null FK 버그 패치 포함).

데이터 규칙: 장비는 `devices` 컬렉션이 단일 소스다 (`rackId` FK로 랙에 연결). 랙/룸에 장비를 중첩 저장하지 않으며, 룸의 랙 목록은 `racks?roomId=` 쿼리로 조회한다. 랙 상세(장비 포함)는 `GET /api/v1/racks/[rackId]`가 devices에서 조합해 준다.

### 새 앱(화면) 추가 방법

1. `src/components/apps/`에 앱 컴포넌트를 생성한다.
2. `TabContent.tsx`의 `Apps` 레지스트리에 menuCode를 키로 `dynamic(() => import(...))` 등록한다.
3. `server/seed.mjs`의 메뉴 시드(menus/menuRoles)에 해당 menuCode 항목을 추가하고 db.json을 재생성하면 사이드바에 노출된다.

### 환경 변수 (.env)

- `MOCK_API` — `false`면 실 백엔드 프록시로 전환. 미설정/그 외 값은 목업 모드 (기본).
- `MOCK_API_URL` — json-server 주소 (기본 `http://localhost:4000`, Vercel 배포 시 외부 목업 URL).
- `INTERNAL_BACKEND_URL` — 실 백엔드 주소 (목업 모드에서는 사용 안 함).

### 경로 별칭

`@/*`는 `./src/*`에 매핑된다 (tsconfig.json).
