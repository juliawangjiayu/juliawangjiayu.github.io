# Direct visitor messages implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish visitor messages on photographs and Collections immediately, limited to three new messages per visitor per rolling minute.

**Architecture:** The static React site reads and writes messages through the existing Cloudflare Worker. D1 owns message records, ownership, frequency checks, and Julia replies. Photo Booth uses a local FastAPI proxy for optional administrator removal and replies.

**Tech Stack:** React/Vite/TypeScript, Hono, D1, FastAPI/SQLite only for local authoring, not message persistence.

**Spec:** `docs/superpowers/specs/2026-11-10-direct-messages-design.md`

## Global Constraints

- No pending or approval state; accepted messages are immediately public.
- Three new messages per visitor per rolling 60 seconds across all targets; idempotent retries do not spend another slot.
- Plain text, 1–500 Unicode code points after normalization; no HTML, Markdown, or clickable links.
- Preserve album zoom, pan, swiping, keyboard navigation, and Info.
- Public payloads contain no visitor email/verifier, session token, admin secret, or Guess Where answer data.

## Review Focus

- Fourth message in 60 seconds returns 429, including when earlier messages were deleted.
- Same idempotency key after a timeout returns one stored message, without another rate-limit event.
- Switching photos while a request is pending never shows the prior photo's messages.
- Editing a message clears an existing Julia reply; ownership protects edits/deletes.
- Anonymous reading and failed Worker requests never force a sign-in dialog.

---

### Task 1: Worker storage and public API

**Files:** `worker/migrations/0007_comments.sql`, `worker/src/comments.ts`, `worker/src/repository.ts`, `worker/src/d1Repository.ts`, `worker/src/app.ts`, `worker/tests/fakes.ts`, `worker/tests/comments.test.ts`.

**Interfaces:** `CommentRecord`; `createComment`, `listComments`, `getComment`, `updateComment`, `deleteComment`, `putCommentReply`; `GET/POST /api/comments` and `PATCH/DELETE /api/comments/:id`. List uses `targetType`, `targetId`, `offset`, and returns `{ comments, hasMore }`. Create requires bearer identity and `idempotency-key`; `POST` body has `{ targetType, targetId, body }`.

- [ ] Write failing tests for immediate public visibility, photo/Collection isolation, ownership, validation, 3/min rolling limit, retry idempotency, and privacy.
- [ ] Run focused tests and confirm feature-specific failures.
- [ ] Add migration, domain validation, repository methods, and Hono routes.
- [ ] Run focused tests, full Worker tests, and typecheck.

### Task 2: Julia administrator actions

**Files:** `worker/src/app.ts`, `worker/src/d1Repository.ts`, `worker/tests/comments.test.ts`.

**Interfaces:** `GET /api/admin/comments`, `DELETE /api/admin/comments/:id`, `PUT/DELETE /api/admin/comments/:id/reply`, protected by existing admin token. Julia reply signature is server-owned.

- [ ] Write failing tests for admin authorization, deletion, reply replacement/removal, and public payload filtering.
- [ ] Implement routes and repository methods.
- [ ] Run focused and full Worker tests.

### Task 3: Public album message panel

**Files:** `src/lib/commentsApi.ts`, `src/components/CommentsPanel.tsx`, `src/components/PhotoViewer.tsx`, `src/pages/CollectionPage.tsx`, `src/styles/global.css`, `src/styles/sectionThemes.css`, `tests/commentsApi.test.ts`.

**Interfaces:** `<CommentsPanel photoId collectionId />`, existing `useVisitorIdentity().runAuthenticated('leave a message', action)` and bearer client.

- [ ] Write failing client tests for target-specific requests, idempotency, and error mapping.
- [ ] Implement client and panel with read, create, edit, delete, pagination, and error/retry states; ignore stale target responses.
- [ ] Mount beneath album and keep a discoverable message control near the viewer.
- [ ] Run tests and build; inspect desktop and mobile in browser.

### Task 4: Photo Booth administration

**Files:** `../photo-booth/apps/studio/backend/messages_remote.py`, `../photo-booth/apps/studio/backend/main.py`, `../photo-booth/apps/studio/frontend/src/MessagesPage.tsx`, and adjacent API/navigation files.

- [ ] Write failing backend tests for credential handling, list/delete/reply proxy, and safe error mapping.
- [ ] Implement local FastAPI proxy using the existing remote endpoint and Keychain secret pattern.
- [ ] Add a simple Messages workspace for list, remove, and Julia reply; no pending badge or approval controls.
- [ ] Run Python tests and frontend build; inspect locally.

### Task 5: Deployment and acceptance

- [ ] Apply local D1 migration and exercise public create/list/edit/delete plus admin reply/delete.
- [ ] Run website test, typecheck, and build; run Photo Booth tests and build.
- [ ] Deploy Worker migration and code before publishing frontend; verify live messages with a disposable test identity and remove test data afterward.
- [ ] Update README and report exact production/local status.
