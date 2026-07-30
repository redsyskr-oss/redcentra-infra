# DCIM Operational Notice Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 공지를 DCIM 운영 게시판으로 확장하고 중요도별 레이어 팝업, 사용자 확인 이력, 서버 페이징을 제공한다.

**Architecture:** Spring Boot가 공지 분류·영향 범위·버전·확인 이력의 단일 진실 공급원이 된다. Next.js는 React Query 기반 서버 페이징 게시판과 로그인 사용자용 미확인 공지 큐를 제공하며, 기존 Tiptap·동일 출처 파일 프록시는 유지한다.

**Tech Stack:** Java 25, Spring Boot 4.0.2, Spring Data JPA, MariaDB, Flyway, JUnit 5, Next.js 16, React 19, TanStack Query 5, Tiptap 3, Tailwind CSS 4, node:test.

## Global Constraints

- 기존 공지 본문·첨부·이미지 데이터를 보존한다.
- 기본 페이지 크기는 20건이다.
- `CRITICAL` 공지는 항상 확인이 필요하며 `GENERAL` 공지는 강제 확인 팝업을 사용할 수 없다.
- 확인자는 요청 본문이 아닌 인증 주체에서 결정한다.
- 확인 이력은 공지 ID·버전·사용자 ID·확인 시각만 저장한다.
- 이미지와 첨부파일은 기존 Next.js 동일 출처 프록시를 유지한다.
- KWCAG 키보드·초점·스크린리더 요구사항을 만족한다.
- 백엔드와 프론트의 기존 미커밋 변경을 덮어쓰지 않는다.

---

### Task 1: 공지 운영 메타데이터와 DB 마이그레이션

**Files:**
- Create: `D:/redcentra/backend/api-server/src/main/resources/db/migration/V9__dcim_operational_notice.sql`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticeType.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticePriority.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticeOperationStatus.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticeScopeType.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticePopupPolicy.java`
- Modify: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/Notice.java`
- Test: `D:/redcentra/backend/domain/src/test/java/com/openrack/domain/system/NoticeTest.java`

**Interfaces:**
- Produces: `Notice.updateOperationalMetadata(...)`, `Notice.ackRequired`, `Notice.version`.
- Enums: `EMERGENCY|MAINTENANCE|SECURITY|GENERAL`, `CRITICAL|IMPORTANT|NORMAL`, `SCHEDULED|IN_PROGRESS|COMPLETED`.

- [ ] **Step 1: Write failing domain tests**

```java
@Test
void criticalNoticeAlwaysRequiresAcknowledgement() {
    Notice notice = notice(NoticePriority.CRITICAL, NoticeType.EMERGENCY, false);
    assertThat(notice.isAckRequired()).isTrue();
}

@Test
void materialUpdateIncrementsVersion() {
    Notice notice = normalNotice();
    notice.updateOperationalMetadata(
        NoticeType.SECURITY, NoticePriority.IMPORTANT,
        NoticeOperationStatus.SCHEDULED, NoticeScopeType.DATACENTER, 3L,
        start, end, NoticePopupPolicy.REQUIRED, true, true);
    assertThat(notice.getVersion()).isEqualTo(2);
}
```

- [ ] **Step 2: Run RED test**

Run: `gradlew.bat :domain:test --tests "*NoticeTest" --no-daemon`
Expected: FAIL because operational fields and methods do not exist.

- [ ] **Step 3: Add enums, fields, migration, and validation**

Migration adds non-null defaults for existing rows:

```sql
ALTER TABLE notice
  ADD COLUMN notice_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN priority VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN operation_status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN scope_type VARCHAR(30) NOT NULL DEFAULT 'ALL',
  ADD COLUMN scope_id BIGINT NULL,
  ADD COLUMN work_start_at DATETIME(6) NULL,
  ADD COLUMN work_end_at DATETIME(6) NULL,
  ADD COLUMN popup_policy VARCHAR(30) NOT NULL DEFAULT 'NONE',
  ADD COLUMN ack_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN notice_version INT NOT NULL DEFAULT 1;
```

Entity stores enums with `@Enumerated(EnumType.STRING)`. The update method increments `noticeVersion` only when `forceReacknowledgement` is true or a material field changes.

- [ ] **Step 4: Run GREEN test**

Run: `gradlew.bat :domain:test --tests "*NoticeTest" --no-daemon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain api-server/src/main/resources/db/migration/V9__dcim_operational_notice.sql
git commit -m "feat: add DCIM notice metadata"
```

---

### Task 2: 사용자 확인 이력 도메인

**Files:**
- Modify: `D:/redcentra/backend/api-server/src/main/resources/db/migration/V9__dcim_operational_notice.sql`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/domain/system/NoticeAcknowledgement.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/repository/system/NoticeAcknowledgementRepository.java`
- Test: `D:/redcentra/backend/domain/src/test/java/com/openrack/domain/system/NoticeAcknowledgementTest.java`

**Interfaces:**
- Produces: `existsByNoticeIdAndNoticeVersionAndUserId`, `findByNoticeIdAndNoticeVersion`.
- Unique key: `(notice_id, notice_version, user_id)`.

- [ ] **Step 1: Write failing acknowledgement tests**

```java
@Test
void acknowledgementCapturesCurrentVersionAndAuthenticatedUser() {
    NoticeAcknowledgement ack = NoticeAcknowledgement.create(notice, 2, user);
    assertThat(ack.getNoticeVersion()).isEqualTo(2);
    assertThat(ack.getUser()).isEqualTo(user);
    assertThat(ack.getAcknowledgedAt()).isNotNull();
}
```

- [ ] **Step 2: Run RED test**

Run: `gradlew.bat :domain:test --tests "*NoticeAcknowledgementTest" --no-daemon`
Expected: FAIL because the entity does not exist.

- [ ] **Step 3: Implement entity, repository, and schema**

```sql
CREATE TABLE notice_acknowledgement (
  acknowledgement_id BIGINT NOT NULL AUTO_INCREMENT,
  notice_id BIGINT NOT NULL,
  notice_version INT NOT NULL,
  user_id BIGINT NOT NULL,
  acknowledged_at DATETIME(6) NOT NULL,
  PRIMARY KEY (acknowledgement_id),
  UNIQUE KEY uk_notice_ack (notice_id, notice_version, user_id),
  CONSTRAINT fk_notice_ack_notice FOREIGN KEY (notice_id) REFERENCES notice(notice_id),
  CONSTRAINT fk_notice_ack_user FOREIGN KEY (user_id) REFERENCES users(member_id)
);
```

- [ ] **Step 4: Run GREEN test**

Run: `gradlew.bat :domain:test --tests "*NoticeAcknowledgementTest" --no-daemon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain api-server/src/main/resources/db/migration/V9__dcim_operational_notice.sql
git commit -m "feat: track notice acknowledgements"
```

---

### Task 3: 서버 페이징·검색·필터 API

**Files:**
- Create: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeSearchCondition.java`
- Modify: `D:/redcentra/backend/domain/src/main/java/com/openrack/repository/system/NoticeRepository.java`
- Create: `D:/redcentra/backend/domain/src/main/java/com/openrack/repository/system/NoticeQueryRepository.java`
- Modify: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/service/notice/NoticeService.java`
- Modify: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/controller/notice/NoticeController.java`
- Modify: notice response DTOs under `api-server/src/main/java/com/openrack/apiserver/dto/notice/`
- Test: `D:/redcentra/backend/api-server/src/test/java/com/openrack/apiserver/service/notice/NoticeSearchServiceTest.java`

**Interfaces:**
- Consumes: operational enums from Task 1.
- Produces: `GET /api/v1/notices?page=0&size=20&type=&priority=&status=&keyword=`.

- [ ] **Step 1: Write failing paging and filtering tests**

```java
@Test
void searchesNoticesWithServerPagingAndOperationalFilters() {
    Page<NoticeResponse> result = service.search(
        new NoticeSearchCondition(EMERGENCY, CRITICAL, IN_PROGRESS, "UPS"),
        PageRequest.of(1, 20));
    assertThat(result.getNumber()).isEqualTo(1);
    verify(queryRepository).search(condition, PageRequest.of(1, 20));
}
```

- [ ] **Step 2: Run RED test**

Run: `gradlew.bat :api-server:test --tests "*NoticeSearchServiceTest" --no-daemon`
Expected: FAIL because search interfaces do not exist.

- [ ] **Step 3: Implement QueryDSL predicates and DTO mapping**

Search title and content case-insensitively. Apply optional enum predicates. Order by pinned descending, priority rank (`CRITICAL`, `IMPORTANT`, `NORMAL`), then created time descending. Cap page size at 100 in the controller.

- [ ] **Step 4: Run GREEN test**

Run: `gradlew.bat :api-server:test --tests "*NoticeSearchServiceTest" --no-daemon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain api-server
git commit -m "feat: search and page operational notices"
```

---

### Task 4: 확인·미확인 팝업 API와 권한

**Files:**
- Create: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeAcknowledgementRequest.java`
- Create: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeAcknowledgementResponse.java`
- Create: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/service/notice/NoticeAcknowledgementService.java`
- Modify: `D:/redcentra/backend/api-server/src/main/java/com/openrack/apiserver/controller/notice/NoticeController.java`
- Test: `D:/redcentra/backend/api-server/src/test/java/com/openrack/apiserver/service/notice/NoticeAcknowledgementServiceTest.java`

**Interfaces:**
- Produces:
  - `GET /api/v1/notices/pending-acknowledgements`
  - `POST /api/v1/notices/{noticeId}/acknowledgements` body `{ "noticeVersion": 2 }`
  - `GET /api/v1/notices/{noticeId}/acknowledgements`

- [ ] **Step 1: Write failing confirmation tests**

Cover current authenticated user, duplicate idempotency, stale version conflict, expired posting period exclusion, and priority ordering.

```java
assertThatThrownBy(() -> service.acknowledge(id, oldVersion, userId))
    .isInstanceOf(NoticeVersionConflictException.class);
```

- [ ] **Step 2: Run RED test**

Run: `gradlew.bat :api-server:test --tests "*NoticeAcknowledgementServiceTest" --no-daemon`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service and controller**

The service reads `userId` from `CustomUserDetails`, never from JSON. Duplicate confirmation returns the existing record. A version mismatch returns HTTP 409 through the existing exception handler.

- [ ] **Step 4: Run GREEN and existing notice tests**

Run: `gradlew.bat :api-server:test --tests "*Notice*Test" --no-daemon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-server
git commit -m "feat: acknowledge operational notices"
```

---

### Task 5: 프론트 타입·API·서버 페이징 상태

**Files:**
- Modify: `D:/redcentra/front/src/components/apps/notice/types.ts`
- Create: `D:/redcentra/front/src/components/apps/notice/notice-api.ts`
- Create: `D:/redcentra/front/src/components/apps/notice/pagination.ts`
- Test: `D:/redcentra/front/src/components/apps/notice/pagination.test.ts`
- Test: `D:/redcentra/front/src/components/apps/notice/notice-api.test.ts`

**Interfaces:**
- Produces: `NoticePage`, `NoticeFilters`, `buildNoticeSearchParams`, `previousPageAfterDelete`.

- [ ] **Step 1: Write failing query and empty-page tests**

```ts
assert.equal(
  buildNoticeSearchParams({ page: 2, size: 20, priority: 'CRITICAL', keyword: 'UPS' }),
  'page=2&size=20&priority=CRITICAL&keyword=UPS',
);
assert.equal(previousPageAfterDelete(2, 0), 1);
```

- [ ] **Step 2: Run RED test**

Run: `node --test src/components/apps/notice/pagination.test.ts src/components/apps/notice/notice-api.test.ts`
Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement types and pure helpers**

`NoticePage` contains `content`, `number`, `size`, `totalElements`, `totalPages`, `first`, and `last`. Empty filters are omitted and keyword is trimmed.

- [ ] **Step 4: Run GREEN test**

Run: `node --test src/components/apps/notice/pagination.test.ts src/components/apps/notice/notice-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/apps/notice
git commit -m "feat: add notice paging contracts"
```

---

### Task 6: DCIM 게시판 화면과 등록 폼

**Files:**
- Modify: `D:/redcentra/front/src/components/apps/Notice.tsx`
- Create: `D:/redcentra/front/src/components/apps/notice/NoticeFilters.tsx`
- Create: `D:/redcentra/front/src/components/apps/notice/NoticeList.tsx`
- Create: `D:/redcentra/front/src/components/apps/notice/NoticePagination.tsx`
- Modify: `D:/redcentra/front/src/components/apps/notice/NoticeFormDialog.tsx`
- Modify: `D:/redcentra/front/src/components/apps/notice/notice-submit.ts`
- Test: `D:/redcentra/front/src/components/apps/notice/notice-submit.test.ts`

**Interfaces:**
- Consumes: Task 5 contracts and existing editor/file upload.
- Produces: filtered table/list, 20-row server paging, operational metadata form.

- [ ] **Step 1: Extend failing submit test**

Assert that create and finalize payloads preserve `noticeType`, `priority`, `operationStatus`, scope, work period, popup policy, acknowledgement, and `forceReacknowledgement`.

- [ ] **Step 2: Run RED test**

Run: `node --test src/components/apps/notice/notice-submit.test.ts`
Expected: FAIL because the input type lacks operational fields.

- [ ] **Step 3: Implement board components**

Use query key:

```ts
['notices', page, filters]
```

Display text badges as well as color. Pagination buttons expose `aria-label="이전 페이지"` and `aria-label="다음 페이지"`. Refresh refetches the current query key. Deletion calls `previousPageAfterDelete` when the response page becomes empty.

- [ ] **Step 4: Run unit, lint, and type checks**

Run:

```bash
node --test src/components/apps/notice/*.test.ts
pnpm.cmd exec eslint src/components/apps/Notice.tsx src/components/apps/notice
pnpm.cmd exec tsc --noEmit
```

Expected: PASS with no new warnings.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/apps
git commit -m "feat: renew notice board for DCIM operations"
```

---

### Task 7: 중요도별 레이어 팝업과 확인 흐름

**Files:**
- Create: `D:/redcentra/front/src/components/notice/OperationalNoticeLayer.tsx`
- Create: `D:/redcentra/front/src/components/notice/notice-layer-policy.ts`
- Test: `D:/redcentra/front/src/components/notice/notice-layer-policy.test.ts`
- Modify: `D:/redcentra/front/src/components/os/TabContent.tsx` or the authenticated shell component that remains mounted after login

**Interfaces:**
- Consumes: pending acknowledgement API from Task 4.
- Produces: one-at-a-time popup queue and `acknowledgeNotice(noticeId, version)`.

- [ ] **Step 1: Write failing policy tests**

```ts
assert.equal(layerAction(criticalNotice), 'REQUIRED');
assert.equal(layerAction(importantNotice), 'DEFERABLE');
assert.equal(layerAction(generalNotice), 'BOARD_ONLY');
assert.deepEqual(sortPending([important, critical]), [critical, important]);
```

- [ ] **Step 2: Run RED test**

Run: `node --test src/components/notice/notice-layer-policy.test.ts`
Expected: FAIL because policy functions do not exist.

- [ ] **Step 3: Implement accessible popup queue**

Use the existing Radix Dialog. Required popups set `onEscapeKeyDown(event.preventDefault())`, `onPointerDownOutside(event.preventDefault())`, hide the default close button, trap focus, and show `확인했습니다`. Deferable popups also show `나중에 확인`. A same-session `Set<number>` suppresses deferred repeats until the next login.

- [ ] **Step 4: Verify policy and accessibility attributes**

Run:

```bash
node --test src/components/notice/notice-layer-policy.test.ts
pnpm.cmd exec eslint src/components/notice
pnpm.cmd exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/notice front/src/components/os
git commit -m "feat: show acknowledged operational notice layers"
```

---

### Task 8: 관리자 확인 현황과 전체 검증

**Files:**
- Create: `D:/redcentra/front/src/components/apps/notice/NoticeAcknowledgementStatus.tsx`
- Modify: `D:/redcentra/front/src/components/apps/Notice.tsx`
- Test: `D:/redcentra/front/src/components/apps/notice/acknowledgement-status.test.ts`

**Interfaces:**
- Consumes: acknowledgement status API from Task 4.
- Produces: 확인·미확인 건수와 사용자별 확인 시각 표시.

- [ ] **Step 1: Write failing status aggregation test**

```ts
assert.deepEqual(summarizeAcknowledgements(users, acknowledgements), {
  acknowledged: 8,
  pending: 2,
});
```

- [ ] **Step 2: Run RED test**

Run: `node --test src/components/apps/notice/acknowledgement-status.test.ts`
Expected: FAIL because the aggregator does not exist.

- [ ] **Step 3: Implement status panel**

Only render the management action when the API authorizes it. Do not infer authority from display text. Show user name, organization when already available, notice version, and acknowledgement time; do not add IP or browser data.

- [ ] **Step 4: Run complete verification**

Backend:

```bash
set GRADLE_USER_HOME=C:\Temp\redcentra-gradle
gradlew.bat :api-server:test --tests "*Notice*Test" --no-daemon
gradlew.bat test --no-daemon
```

Frontend:

```powershell
$tests = Get-ChildItem -Recurse src -Filter '*.test.ts' | ForEach-Object FullName
node --test $tests
pnpm.cmd lint
pnpm.cmd exec tsc --noEmit
pnpm.cmd build
```

Expected: all notice tests, type checks, and production build pass. Any unrelated pre-existing full-suite failure is recorded separately with its exact test name.

- [ ] **Step 5: Manual integration verification**

Verify with two PCs:

1. Create a critical notice with an inline image and document.
2. Sign in as another user and confirm the required layer appears.
3. Confirm keyboard focus cannot leave the required layer.
4. Acknowledge it and confirm it does not reappear.
5. Materially edit it with reacknowledgement enabled.
6. Confirm the second user sees the new version.
7. Open the image and download the attachment from the other PC.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/apps/Notice.tsx front/src/components/apps/notice
git commit -m "feat: report notice acknowledgement status"
```
