# Comments and Photo Booth Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated visitors leave photo or Collection messages that become public only after Julia reviews them in Photo Booth and may reply as `Julia Wang`.

**Architecture:** D1 is the only source of truth for messages and replies. The public React site reads published messages and the current visitor's own pending records; Photo Booth's React UI reaches protected Worker admin endpoints only through local FastAPI, which obtains its token from macOS Keychain.

**Tech Stack:** TypeScript/Hono/Zod/D1/React in `juliawangjiayu.github.io`; Python/FastAPI/keyring/React/Vite in sibling repo `../photo-booth`.

**Spec:** `docs/superpowers/specs/2026-10-28-visitor-identity-comments-leaderboards-design.md`

## Global Constraints

- Complete `2026-10-28-visitor-identity-foundation.md` first and consume its bearer identity APIs unchanged.
- Message body is plain text, trimmed, non-empty, at most 500 characters; never render it as HTML/Markdown or auto-link URLs.
- New and visitor-edited messages are `pending`; only `published` records are public to other visitors.
- A comment has at most one Julia reply; the signature is fixed server/UI copy `Julia Wang`, not visitor-provided data.
- Public APIs never expose rejected/deleted bodies, moderation metadata, email verifier, or admin credentials.
- Photo Booth stores the moderation token only in macOS Keychain under `website_moderation_token`; never SQLite or frontend JSON.
- Do not copy D1 messages into Photo Booth SQLite; remote D1 remains authoritative.
- Preserve the current photo viewer's zoom, pan, info card, keyboard, and swipe behavior.

## Review Focus

- A late photo-A response after navigating to photo B is ignored instead of appearing under B (Task 3 test).
- Editing a published message hides both message and reply publicly until re-approval (Task 2 test).
- Repeated approve/reject clicks are idempotent and cannot create duplicate state transitions (Task 2 test).
- A target ID no longer present in local Photo Booth still renders a moderatable `Unknown or no longer local` item (Task 5 verification).
- A timeout during comment submission with the same idempotency key creates at most one message (Task 2 test).

---

### Task 1: Comment schema, domain model, and repository

**Files:**
- Create: `worker/migrations/0004_comments.sql`
- Create: `worker/src/comments.ts`
- Create: `worker/tests/comments.test.ts`
- Modify: `worker/src/repository.ts`
- Modify: `worker/src/d1Repository.ts`
- Modify: `worker/tests/fakes.ts`

**Interfaces:**
- Consumes: visitor IDs and `IdentityRepository` from the identity plan.
- Produces: `CommentRecord`, `CommentReplyRecord`, `PublicComment`, `AdminComment`, `CommentRepository`, `normalizeCommentBody(body): string`, and `transitionComment(comment, event, now): CommentRecord`.

- [ ] **Step 1: Write failing domain tests**

Assert empty/control-only and >500-character bodies fail; URLs remain unchanged plain text; pending→published/rejected/deleted, published→rejected/deleted, and rejected→published transitions follow the spec; visitor edit from pending/published/rejected returns to pending; deleted is terminal; replies are visible only for published parents.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='comment body|comment transition|reply visibility' worker/tests/*.test.ts`

Expected: FAIL because `worker/src/comments.ts` is missing.

- [ ] **Step 3: Implement comment domain types and transitions**

Use stable errors `invalid_comment_body`, `invalid_comment_transition`, and `comment_deleted`. Strip C0/C1 controls except newline; normalize CRLF to LF; count the final JavaScript string by Unicode code points and enforce 500.

- [ ] **Step 4: Add migration and repository methods**

Create `comments`, `comment_replies`, and `comment_idempotency` tables with the spec indexes. Add exact methods:

```ts
createComment(comment: CommentRecord, idempotencyKey: string): Promise<CommentRecord>
getComment(id: string): Promise<CommentRecord | null>
listPublicComments(targetType: CommentTargetType, targetId: string): Promise<CommentRecord[]>
listVisitorComments(visitorId: string, targetType: CommentTargetType, targetId: string): Promise<CommentRecord[]>
listAdminComments(status: CommentStatus, cursor: string | null, limit: number): Promise<AdminCommentPage>
updateComment(comment: CommentRecord): Promise<void>
putCommentReply(reply: CommentReplyRecord): Promise<void>
deleteCommentReply(commentId: string): Promise<void>
getCommentReply(commentId: string): Promise<CommentReplyRecord | null>
countAdminComments(status: CommentStatus): Promise<number>
```

- [ ] **Step 5: Extend D1 and memory repositories and verify**

Run: `node --test --test-name-pattern='comment body|comment transition|reply visibility' worker/tests/*.test.ts && npm run typecheck`

Expected: focused tests PASS and repository implementations typecheck.

- [ ] **Step 6: Commit in the website repo**

```bash
git add worker/migrations/0004_comments.sql worker/src/comments.ts worker/src/repository.ts worker/src/d1Repository.ts worker/tests/comments.test.ts worker/tests/fakes.ts
git commit -m "feat: add moderated comment persistence"
```

### Task 2: Public and administrator comment APIs

**Files:**
- Modify: `worker/src/app.ts`
- Modify: `worker/tests/api.test.ts`
- Modify: `worker/tests/privacy.test.ts`

**Interfaces:**
- Consumes: Task 1 `CommentRepository`, identity plan `optionalVisitor`/`requireVisitor`, and existing `/api/admin/*` authentication.
- Produces: public comment CRUD routes plus the five administrator moderation/reply routes from the spec.

- [ ] **Step 1: Write failing public API tests**

Cover public-only published results, current visitor's own pending results, no other visitor's pending results, ownership on edit/delete, published-edit-to-pending, rejected-edit-to-pending, soft delete, 5 writes/10 minutes, target pattern `^[A-Za-z0-9_-]{1,128}$`, and retry with one idempotency key creating one row.

- [ ] **Step 2: Write failing administrator and privacy tests**

Cover unauthorized admin access; pending pagination; approve, reject/unpublish, delete, reply put/edit/delete; one-reply constraint; idempotent repeated moderation; and serialized public/admin payloads containing no email verifier or private Guess Where answer fields.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='comment API|comment moderation|comment privacy' worker/tests/*.test.ts`

Expected: FAIL because routes are absent.

- [ ] **Step 4: Implement public routes**

Add `GET/POST /api/comments` and `PATCH/DELETE /api/comments/:id`. Authenticated GET merges published comments with only the caller's non-public records and adds explicit `visibility: 'public'|'owner-only'`; de-duplicate a caller's now-published row by ID.

- [ ] **Step 5: Implement administrator routes**

Add list/approve/reject/delete/reply endpoints exactly as specified. Treat repeated approve/reject of the current same state as success; a conflicting terminal transition returns `409 invalid_comment_transition`.

- [ ] **Step 6: Run full Worker verification**

Run: `npm test && npm run typecheck`

Expected: all tests PASS.

- [ ] **Step 7: Commit in the website repo**

```bash
git add worker/src/app.ts worker/tests/api.test.ts worker/tests/privacy.test.ts
git commit -m "feat: expose moderated comment APIs"
```

### Task 3: Public photo and Collection message panel

**Files:**
- Create: `src/lib/commentsApi.ts`
- Create: `src/lib/commentPanelState.ts`
- Create: `src/components/CommentsPanel.tsx`
- Create: `tests/commentPanelState.test.ts`
- Modify: `src/components/PhotoViewer.tsx`
- Modify: `src/pages/CollectionPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: identity plan `useVisitorIdentity()` and Task 2 public routes.
- Produces: `<CommentsPanel photoId collectionId />` and request-key reducer `reduceCommentPanel(state, action): CommentPanelState`.

- [ ] **Step 1: Write failing panel-state tests**

Assert `This photo` and `Collection` create distinct request keys; a stale response is ignored; changing photo resets only the photo target; Collection state stays attached to the Collection; submitted pending rows show owner-only status; successful edit/delete updates one row without duplicates.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='comment panel' tests/*.test.ts`

Expected: FAIL because `commentPanelState.ts` is missing.

- [ ] **Step 3: Implement comments API and state reducer**

All authenticated calls reuse the identity API bearer helper. Generate one UUID idempotency key per submit intent and reuse it only for retries of that intent.

- [ ] **Step 4: Implement `CommentsPanel`**

Render two tabs, public entries, own `Awaiting review` entries, one Julia reply, a 500-character plain-text composer, owner edit/delete controls, exact review-confirmation copy, and offline/retry states. Invoke `runAuthenticated('leave a message', action)` only on a write, never when opening/reading.

- [ ] **Step 5: Integrate below the viewer without narrowing it**

Add `collectionId` to `PhotoViewerProps`, pass it from `CollectionPage`, add a discoverable message control near existing tools, and mount the expanded panel after the viewer stage/footer. Photo navigation supplies the current photo ID.

- [ ] **Step 6: Run tests and build**

Run: `npm test && npm run build`

Expected: all tests PASS and build succeeds.

- [ ] **Step 7: Manually verify viewer regressions**

At desktop and ≤680px: zoom/pan, keyboard arrows, swipe, Info, and next/previous still work; comments expand beneath the image; switching photos cannot show stale messages; unauthenticated reading never opens identity.

- [ ] **Step 8: Commit in the website repo**

```bash
git add src/lib/commentsApi.ts src/lib/commentPanelState.ts src/components/CommentsPanel.tsx tests/commentPanelState.test.ts src/components/PhotoViewer.tsx src/pages/CollectionPage.tsx src/styles/global.css
git commit -m "feat: add photo and collection messages"
```

### Task 4: Photo Booth moderation proxy and Keychain configuration

**Files:**
- Create: `../photo-booth/apps/studio/backend/messages_remote.py`
- Create: `../photo-booth/tests/test_messages_remote.py`
- Modify: `../photo-booth/apps/studio/backend/main.py`
- Modify: `../photo-booth/apps/studio/backend/secret_store.py`
- Modify: `../photo-booth/tests/test_api.py`

**Interfaces:**
- Consumes: Task 2 administrator routes, local setting `ai_place_remote_endpoint`, and `SecretStore`.
- Produces: `ModerationClient` plus local `/api/messages/config`, `/api/messages`, `/api/messages/pending-count`, and mutation proxy endpoints.

- [ ] **Step 1: Write failing remote-client tests**

Test exact HTTPS/loopback endpoint validation, bearer header injection, query encoding, response schema validation, timeout/401/5xx mapping, and error messages that never include endpoint token or response secrets.

- [ ] **Step 2: Run focused Python tests and confirm failure**

Run from `../photo-booth`: `.venv/bin/pytest tests/test_messages_remote.py -q`

Expected: FAIL because `messages_remote.py` is missing.

- [ ] **Step 3: Implement `ModerationClient`**

Constructor and methods:

```py
ModerationClient(endpoint: str, token: str, requester=urlopen)
list_comments(status: str, cursor: str | None = None) -> dict
pending_count() -> int
approve(comment_id: str) -> dict
reject(comment_id: str) -> dict
delete(comment_id: str) -> None
put_reply(comment_id: str, body: str) -> dict
delete_reply(comment_id: str) -> None
```

Use a 10-second timeout and the same URL/token redaction standards as `ai_publish.py`.

- [ ] **Step 4: Write failing FastAPI proxy tests**

Inject `MemorySecretStore`; assert config responses return only token mask/configured state; `website_moderation_token` is written/deleted in the injected store; list/count/actions delegate to a fake client; absent endpoint/token gives clear `409`; no route response contains raw token.

- [ ] **Step 5: Implement local routes**

Reuse `ai_place_remote_endpoint` for the Worker base URL. Add GET/PUT config routes for the separate moderation token and proxy routes matching the frontend contract. Do not persist remote message bodies locally.

- [ ] **Step 6: Run backend tests**

Run from `../photo-booth`: `.venv/bin/pytest -q`

Expected: all tests PASS.

- [ ] **Step 7: Commit in the Photo Booth repo**

```bash
git add apps/studio/backend/messages_remote.py apps/studio/backend/main.py apps/studio/backend/secret_store.py tests/test_messages_remote.py tests/test_api.py
git commit -m "feat: proxy website comment moderation"
```

### Task 5: Photo Booth Messages workspace

**Files:**
- Create: `../photo-booth/apps/studio/frontend/src/MessagesPage.tsx`
- Create: `../photo-booth/apps/studio/frontend/src/messagesState.ts`
- Modify: `../photo-booth/apps/studio/frontend/src/App.tsx`
- Modify: `../photo-booth/apps/studio/frontend/src/api.ts`
- Modify: `../photo-booth/apps/studio/frontend/src/types.ts`
- Modify: `../photo-booth/apps/studio/frontend/src/styles.css`

**Interfaces:**
- Consumes: Task 4 local proxy routes plus App's existing `photos` and `collections` arrays.
- Produces: top-level `messages` page, pending badge, status filters, target resolver, moderation actions, and Julia reply editor.

- [ ] **Step 1: Add frontend contracts and pure target resolution**

Define `ModeratedComment`, `MessagePage`, `MessagesConfig`, and `resolveMessageTarget(comment, photos, collections): ResolvedTarget`. Unknown IDs must return label `Unknown or no longer local` plus the raw safe ID.

- [ ] **Step 2: Add typed API methods**

Add config, list, pending-count, approve, reject, delete, put-reply, and delete-reply methods to `api.ts`; keep the admin token entirely behind FastAPI.

- [ ] **Step 3: Implement `MessagesPage`**

Default to Pending; include Published/Rejected filters, loading/empty/offline/unauthorized/not-configured states, target thumbnail/title, username/body/age/state, disabled in-flight controls, and one reply editor signed `Julia Wang`.

- [ ] **Step 4: Wire navigation and pending count**

Add `messages` to `Page`, sidebar nav, titles/descriptions, and a pending-count badge refreshed on page open and after moderation. Pass local photos/collections to resolve targets; do not add a local database copy.

- [ ] **Step 5: Build and manually exercise the UI**

Run from `../photo-booth/apps/studio/frontend`: `npm run build`

Expected: TypeScript/Vite build exits 0. Then verify every status filter and action against a fake/local Worker, including unknown targets and remote unauthorized state.

- [ ] **Step 6: Commit in the Photo Booth repo**

```bash
git add apps/studio/frontend/src/MessagesPage.tsx apps/studio/frontend/src/messagesState.ts apps/studio/frontend/src/App.tsx apps/studio/frontend/src/api.ts apps/studio/frontend/src/types.ts apps/studio/frontend/src/styles.css
git commit -m "feat: add Photo Booth message review"
```

### Task 6: Cross-application acceptance and privacy audit

**Files:**
- Modify: `README.md`
- Modify: `../photo-booth/README.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: reproducible local setup and verified end-to-end moderation flow.

- [ ] **Step 1: Document configuration and startup order**

Document D1 migration, Worker secret, Photo Booth Keychain field, Worker endpoint reuse, and start commands for ports 8787, 4173, 8000, and 5173.

- [ ] **Step 2: Run both automated suites**

Run in website repo: `npm test && npm run typecheck && npm run build`

Run in Photo Booth repo: `.venv/bin/pytest -q && cd apps/studio/frontend && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Execute the ten-step comment acceptance flow from the spec**

Submit photo and Collection messages, confirm neither is public, approve/reject in Photo Booth, add/edit/delete Julia reply, edit a published visitor message back to pending, delete own message, and confirm public visibility after each transition.

- [ ] **Step 4: Audit storage and traffic**

Search D1 schema/data, Photo Booth SQLite, Local Storage, generated JSON, network responses, and logs. Expected: no plaintext email, moderation token, private Guess Where coordinates in public comment responses, or local copy of message bodies.

- [ ] **Step 5: Commit documentation separately in each repo**

```bash
git add README.md
git commit -m "docs: explain website message moderation"
```

From `../photo-booth`:

```bash
git add README.md
git commit -m "docs: explain message review setup"
```
