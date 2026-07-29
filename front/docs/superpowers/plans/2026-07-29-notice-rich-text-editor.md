# Notice Rich Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver working notice create, edit, delete, rich HTML content, inline images, and Office/PDF/HWP attachments across the Next.js frontend and Spring Boot backend.

**Architecture:** The backend owns notice CRUD and returns files from the existing generic `FileStorage` table using `refType=NOTICE`. The frontend uses a small Tiptap editor, uploads files only after a notice ID exists, stores stable same-origin URLs for inline images, sanitizes HTML before display, and uses one form for create and edit.

**Tech Stack:** Java 25, Spring Boot 4.0.2, JUnit 5, Mockito, Next.js 16, React 19, TypeScript, Tiptap 3, DOMPurify, node:test, pnpm.

## Global Constraints

- Use pnpm for frontend dependencies and scripts.
- Do not modify generated files under `src/components/ui`.
- Use only Tiptap MIT-licensed editor packages.
- Inline images require non-empty alternative text.
- Attachments allow PNG, JPEG, WebP, PPT/PPTX, XLS/XLSX, DOC/DOCX, PDF, HWP/HWPX.
- Persist stable `/api/notice-images/{fileId}` image URLs, never presigned URLs.
- Sanitize stored HTML before rendering; the client sanitizer is defense in depth, not the server security boundary.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Backend Notice CRUD Contract

**Files:**
- Create: `../backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeUpsertRequest.java`
- Create: `../backend/api-server/src/test/java/com/openrack/apiserver/service/notice/NoticeServiceTest.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/controller/notice/NoticeController.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/service/notice/NoticeService.java`

**Interfaces:**
- Consumes: `UsersRepository.findById(Long)`, `CustomUserDetails.getMemberId()`, `NoticeRepository`.
- Produces: `NoticeDetailResponse create(NoticeUpsertRequest, Long)`, `NoticeDetailResponse update(Long, NoticeUpsertRequest)`, `void delete(Long)`.

- [ ] **Step 1: Write failing service tests**

Create tests that build real `Notice` and `Users` entities where possible and mock only repositories. Cover these hand-derived behaviors:

```java
@Test
void createStoresAuthenticatedWriterAndHtmlContent() {
    NoticeUpsertRequest request = request("점검 안내", "<p>본문</p>", true);
    when(usersRepository.findById(7L)).thenReturn(Optional.of(writer));
    when(noticeRepository.save(any(Notice.class))).thenAnswer(invocation -> invocation.getArgument(0));

    NoticeDetailResponse result = service.create(request, 7L);

    assertThat(result.getTitle()).isEqualTo("점검 안내");
    assertThat(result.getContent()).isEqualTo("<p>본문</p>");
}

@Test
void updateChangesExistingNoticeFields() {
    when(noticeRepository.findById(3L)).thenReturn(Optional.of(existingNotice));
    NoticeDetailResponse result = service.update(3L, request("변경", "<p>변경 본문</p>", false));
    assertThat(result.getTitle()).isEqualTo("변경");
}

@Test
void deleteRemovesTheRequestedNotice() {
    when(noticeRepository.findById(3L)).thenReturn(Optional.of(existingNotice));
    service.delete(3L);
    verify(noticeRepository).delete(existingNotice);
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `gradlew.bat :api-server:test --tests "*NoticeServiceTest"`

Expected: compilation failure because `NoticeUpsertRequest` and mutation methods do not exist.

- [ ] **Step 3: Implement minimal DTO, service, and controller**

`NoticeUpsertRequest` contains validated `title`, `content`, `pinned`, `postStart`, and `postEnd`. Add:

```java
@PostMapping
public ResponseEntity<ApiResponse<NoticeDetailResponse>> create(
        @Valid @RequestBody NoticeUpsertRequest request,
        @AuthenticationPrincipal CustomUserDetails currentUser)

@PutMapping("/{noticeId}")
public ResponseEntity<ApiResponse<NoticeDetailResponse>> update(
        @PathVariable Long noticeId,
        @Valid @RequestBody NoticeUpsertRequest request)

@DeleteMapping("/{noticeId}")
public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long noticeId)
```

Use the project’s `RESOURCE_NOT_FOUND` exception pattern. Reject `postEnd < postStart` in the request or service with a validation error.

- [ ] **Step 4: Run backend notice tests and verify GREEN**

Run: `gradlew.bat :api-server:test --tests "*NoticeServiceTest"`

Expected: all `NoticeServiceTest` tests pass.

- [ ] **Step 5: Commit backend CRUD**

Stage only Task 1 files and commit `feat: add notice management API`.

---

### Task 2: Backend Notice Attachments

**Files:**
- Modify: `../backend/domain/src/main/java/com/openrack/domain/system/FileStorage.java`
- Modify: `../backend/domain/src/main/java/com/openrack/repository/system/FileStorageRepository.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeFileResponse.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/dto/notice/NoticeDetailResponse.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/service/notice/NoticeService.java`
- Modify: `../backend/api-server/src/main/java/com/openrack/apiserver/controller/notice/NoticeController.java`
- Modify: `../backend/api-server/src/test/java/com/openrack/apiserver/service/notice/NoticeServiceTest.java`

**Interfaces:**
- Consumes: `FileStorageRepository.findByRefTypeAndRefId("NOTICE", noticeId)`.
- Produces: `List<NoticeFileResponse> files`, each containing `fileId`, `fileName`, `mimeType`, and `fileSize`.

- [ ] **Step 1: Add failing attachment tests**

```java
@Test
void detailReturnsGenericFilesLinkedToNotice() {
    when(noticeRepository.findById(3L)).thenReturn(Optional.of(existingNotice));
    when(fileStorageRepository.findByRefTypeAndRefId("NOTICE", 3L))
            .thenReturn(List.of(storedFile("manual.pdf", "application/pdf", 1200L)));

    NoticeDetailResponse result = service.getNotice(3L);

    assertThat(result.getFiles()).singleElement()
            .extracting(NoticeFileResponse::getFileName)
            .isEqualTo("manual.pdf");
}
```

Also test `getNoticeFiles(3L)` uses the same reference filter and that deleting a notice deletes its linked `FileStorage` metadata through a repository bulk delete.

- [ ] **Step 2: Run tests and verify RED**

Run: `gradlew.bat :api-server:test --tests "*NoticeServiceTest"`

Expected: failure because detail still reads legacy `NoticeFile` and the repository lacks the delete method.

- [ ] **Step 3: Implement generic attachment mapping**

Add `NOTICE_ATTACHMENT` to `FileCategory`, add:

```java
List<FileStorage> findByRefTypeAndRefId(String refType, Long refId);
void deleteByRefTypeAndRefId(String refType, Long refId);
```

Change `NoticeDetailResponse.from` to accept a `List<FileStorage>` and map `fileId`, filename, MIME, and size. Add `GET /api/v1/notices/{noticeId}/files`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `gradlew.bat :api-server:test --tests "*NoticeServiceTest"`

Expected: all notice tests pass.

- [ ] **Step 5: Commit backend attachments**

Stage only Task 2 files and commit `feat: link stored files to notices`.

---

### Task 3: Frontend Content Safety and File Policy

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/components/apps/notice/types.ts`
- Create: `src/components/apps/notice/file-validation.ts`
- Create: `src/components/apps/notice/file-validation.test.ts`
- Create: `src/components/apps/notice/content.ts`
- Create: `src/components/apps/notice/content.test.ts`

**Interfaces:**
- Produces:
  - `validateNoticeFile(file: Pick<File, "name" | "type" | "size">): string | null`
  - `sanitizeNoticeHtml(html: string, window: Window): string`
  - `noticeImageUrl(fileId: number): string`
  - `Notice`, `NoticeFile`, `NoticeInput`.

- [ ] **Step 1: Install required MIT dependencies**

Run:

```powershell
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header dompurify
pnpm add -D jsdom @types/dompurify
```

- [ ] **Step 2: Write failing policy and sanitizer tests**

Use `node:test`, literal expected values, and JSDOM. Cover:

```typescript
test('accepts government office attachment formats', () => {
  assert.equal(validateNoticeFile(file('회의자료.PPTX', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')), null);
  assert.equal(validateNoticeFile(file('공문.hwpx', 'application/octet-stream')), null);
});

test('rejects executable attachments', () => {
  assert.match(validateNoticeFile(file('payload.exe', 'application/x-msdownload')) ?? '', /지원하지/);
});

test('removes scripts, event handlers, and javascript URLs', () => {
  const clean = sanitizeNoticeHtml('<p onclick="x()">안내<script>x()</script><a href="javascript:x()">링크</a></p>', window);
  assert.equal(clean, '<p>안내<a>링크</a></p>');
});

test('keeps semantic notice markup', () => {
  const clean = sanitizeNoticeHtml('<table><tbody><tr><th>항목</th><td>값</td></tr></tbody></table>', window);
  assert.equal(clean, '<table><tbody><tr><th>항목</th><td>값</td></tr></tbody></table>');
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test src/components/apps/notice/file-validation.test.ts src/components/apps/notice/content.test.ts`

Expected: module-not-found failures for the new production helpers.

- [ ] **Step 4: Implement minimal helpers and types**

Use DOMPurify with explicit `ALLOWED_TAGS` and `ALLOWED_ATTR`. Permit safe relative URLs, HTTPS URLs, and `/api/notice-images/{positiveInteger}` image paths. Reject executable and unknown extensions. Do not invent a frontend file-size cap when the backend has none.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test src/components/apps/notice/file-validation.test.ts src/components/apps/notice/content.test.ts`

Expected: all tests pass without warnings.

- [ ] **Step 6: Commit frontend foundations**

Stage Task 3 files and commit `feat: add notice content safety rules`.

---

### Task 4: Stable Inline Image Route and File Client

**Files:**
- Create: `src/app/api/notice-images/[fileId]/route.ts`
- Modify: `src/lib/upload.ts`
- Create: `src/lib/upload.test.ts`

**Interfaces:**
- Consumes: backend `GET /api/v1/files/{fileId}/presigned-download`.
- Produces:
  - `GET /api/notice-images/{fileId}` returning a temporary redirect.
  - `getNoticeFiles(noticeId)`, `deleteFile(fileId)`, existing `uploadFile`.

- [ ] **Step 1: Write failing URL and response normalization tests**

Test that wrapped backend responses are unwrapped by the upload client helper and invalid file IDs return 400 from an extracted route helper. Test the concrete redirect contract with a literal `https://storage.example/file` URL.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/lib/upload.test.ts`

Expected: missing helper exports.

- [ ] **Step 3: Implement the route and upload client**

The route validates a positive integer, forwards authentication using the same backend proxy conventions, requests the presigned URL, and returns `NextResponse.redirect(url, 307)` with private/no-store caching. Never persist the returned presigned URL.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test src/lib/upload.test.ts`

Expected: all upload contract tests pass.

- [ ] **Step 5: Commit image route**

Stage Task 4 files and commit `feat: proxy inline notice images`.

---

### Task 5: Accessible Tiptap Editor

**Files:**
- Create: `src/components/apps/notice/NoticeEditor.tsx`
- Create: `src/components/apps/notice/NoticeEditorToolbar.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `{ value: string; onChange(html: string): void; onImageRequest(file: File, alt: string): Promise<string> }`.
- Produces: accessible HTML editor with toolbar and stable image insertion URL.

- [ ] **Step 1: Define observable editor behavior before implementation**

The component must initialize with `immediatelyRender: false`, call `onChange(editor.getHTML())`, expose an editor label, toolbar label, named buttons, `aria-pressed` toggle state, and require alternative text before image insertion.

- [ ] **Step 2: Add a failing pure command-model test**

Extract a small `editor-actions.ts` model that maps action IDs to Korean labels and whether they are toggle actions. Test that every rendered action has a non-empty accessible name and that image insertion rejects blank alternative text.

- [ ] **Step 3: Run test and verify RED**

Run: `node --test src/components/apps/notice/editor-actions.test.ts`

Expected: missing module.

- [ ] **Step 4: Implement minimal editor and toolbar**

Configure StarterKit without duplicate Link/Underline extensions, TextAlign for headings and paragraphs, table extensions, and link validation. Implement toolbar buttons for headings, bold, underline, alignment, lists, link, table, undo, redo, and image.

- [ ] **Step 5: Run test and verify GREEN**

Run: `node --test src/components/apps/notice/editor-actions.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Run lint on editor files**

Run: `pnpm exec eslint src/components/apps/notice/NoticeEditor.tsx src/components/apps/notice/NoticeEditorToolbar.tsx src/components/apps/notice/editor-actions.ts`

Expected: zero errors.

- [ ] **Step 7: Commit editor**

Stage Task 5 files and commit `feat: add accessible notice editor`.

---

### Task 6: Unified Create/Edit Dialog and Notice Screen

**Files:**
- Create: `src/components/apps/notice/NoticeFormDialog.tsx`
- Create: `src/components/apps/notice/NoticeContent.tsx`
- Create: `src/components/apps/notice/notice-submit.ts`
- Create: `src/components/apps/notice/notice-submit.test.ts`
- Modify: `src/components/apps/Notice.tsx`

**Interfaces:**
- Consumes: Task 1 CRUD APIs, Task 2 file list, Task 3 validation/sanitizing, Task 4 uploads, Task 5 editor.
- Produces: working list/detail/create/edit/delete UI.

- [ ] **Step 1: Write failing submit-flow tests**

Extract:

```typescript
submitNotice(input: NoticeInput, files: PendingNoticeFile[], dependencies: SubmitDependencies): Promise<Notice>
```

Test with specific fakes that:

- create runs before uploads and passes returned `noticeId` as `refId`;
- update uses `PUT /api/v1/notices/{id}`;
- upload failures return the saved notice plus failed filenames instead of erasing success;
- image placeholder URLs are replaced with `/api/notice-images/{fileId}` before the final update.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test src/components/apps/notice/notice-submit.test.ts`

Expected: missing module.

- [ ] **Step 3: Implement the minimal submission orchestrator**

Keep network dependencies injectable and use real transformation behavior. Do not assert only that mocks were called; assert final payloads and returned results.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test src/components/apps/notice/notice-submit.test.ts`

Expected: all flow tests pass.

- [ ] **Step 5: Implement form and screen integration**

Replace the single-line content input. Add:

- create and edit buttons;
- detail query for selected notice;
- sanitized detail HTML;
- existing and newly selected attachment lists;
- file removal with confirmation;
- attachment download using `getFileUrl`;
- mutation error summary and partial upload failure list;
- loading and disabled states;
- Korean labels encoded as UTF-8.

- [ ] **Step 6: Run focused tests and lint**

Run:

```powershell
node --test src/components/apps/notice/*.test.ts src/lib/upload.test.ts
pnpm exec eslint src/components/apps/Notice.tsx src/components/apps/notice src/lib/upload.ts src/app/api/notice-images
```

Expected: tests pass and ESLint reports zero errors.

- [ ] **Step 7: Commit integrated screen**

Stage Task 6 files and commit `feat: integrate notice editor and attachments`.

---

### Task 7: Full Verification

**Files:**
- Review only; fix scoped failures in files introduced by Tasks 1–6.

- [ ] **Step 1: Run complete backend tests**

Run from `D:\redcentra\backend`: `gradlew.bat test`

Expected: BUILD SUCCESSFUL with zero failed tests.

- [ ] **Step 2: Run all frontend node tests**

Run from `D:\redcentra\front`: `node --test src/**/*.test.ts`

Expected: all tests pass.

- [ ] **Step 3: Run frontend lint**

Run: `pnpm lint`

Expected: zero ESLint errors.

- [ ] **Step 4: Run frontend production build**

Run: `pnpm build`

Expected: Next.js production build exits 0.

- [ ] **Step 5: Inspect final diffs**

Run:

```powershell
git -c safe.directory=D:/redcentra diff --check
git -c safe.directory=D:/redcentra status --short
```

Confirm only scoped notice/editor/file changes and pre-existing user changes are present. Do not stage unrelated changes.

- [ ] **Step 6: Final integration commit if verification required fixes**

Commit only scoped fixes with `fix: complete notice editor integration`.
