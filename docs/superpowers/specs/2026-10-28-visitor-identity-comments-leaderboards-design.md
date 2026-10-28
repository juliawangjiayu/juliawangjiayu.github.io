# Visitor Identity, Comments, Leaderboards, and Share Cards — Design

Status: Proposed for implementation after builder review
Date: 2026-10-28
Projects: `juliawangjiayu.github.io` and `photo-booth`

## 1. Intent

Add a deliberately lightweight visitor identity to Julia Wang's photography website so a visitor can:

- leave a message on one photograph or its Collection;
- complete all five Guess Where rounds anonymously, then save a score or create a share card;
- keep one public best score per Guess Where mode;
- return under the same public username by supplying the same username and email.

Julia moderates every visitor message in Photo Booth before it becomes public and may add one signed reply as `Julia Wang`.

This feature must preserve the existing split architecture:

- the public React site remains a static GitHub Pages deployment;
- Cloudflare Worker + D1 owns dynamic public data and all server-side trust decisions;
- Photo Booth remains Julia's local administration application;
- Photo Booth reaches the Worker through its local FastAPI backend, so administrator credentials never enter the Photo Booth browser bundle.

## 2. Product decisions already approved

### 2.1 Lightweight identity

- Reading the site and playing five Guess Where rounds requires no identity.
- Identity is requested only when the visitor first tries to:
  - submit a message;
  - save a score to a leaderboard; or
  - generate a persistent same-five challenge link and share card.
- The form asks for a unique username and an email. There is no password and no email verification code.
- The visitor sees an explicit notice that this is a lightweight identity, not a high-security account.
- The public username is the only public identity. There is no profile page.
- Usernames are unique without regard to case and Unicode presentation.
- Julia-controlled names, including `Julia Wang` and administrator-like variants, are reserved.
- The same email cannot create several usernames.
- Supplying an existing username with its original email signs the visitor back in. A mismatched pair is rejected without revealing which field matched.

### 2.2 Messages

- A message targets either one photo or the whole Collection.
- In the photo viewer, the message action sits near the existing photo controls.
- Activating it expands the message area below the photograph; it never narrows the photograph.
- Two tabs switch between `This photo` and `Collection`.
- Mobile uses one vertical column.
- New messages are private and `pending` until Julia approves them.
- The visitor receives: `Submitted for review. It will appear here after Julia approves it.`
- Julia can approve, reject, or delete a message in Photo Booth.
- Julia can add, edit, or remove one reply per visitor message, signed `Julia Wang`.
- Visitors cannot create nested reply threads.
- A signed-in visitor can delete their own message.
- Editing a published message returns it to `pending`; editing a pending message keeps it pending.
- Message bodies are plain text, at most 500 characters. Markdown, images, HTML, and clickable external links are not supported in V1.

### 2.3 Guess Where results

- Finishing five rounds and seeing the result never requires identity.
- The result page offers two independent actions:
  1. `Create share card` — creates a same-five challenge URL and a downloadable 1200×630 image.
  2. `Save to leaderboard` — compares this run with the visitor's saved best for the current mode.
- Either action opens the lightweight identity dialog when needed, then resumes the original action after successful sign-in.
- Share cards contain username, mode, total score, five round scores, QR code, and same-five challenge URL.
- Share cards do not reveal correct answers, coordinates, radii, or place names.
- Where supported, the Web Share API shares the generated PNG and link. Otherwise the UI offers PNG download and link copy.
- Leaderboards are separate for Easy, Medium, Hard, and Random.
- Each username has only one visible row per mode: their historical best score.
- A lower score never replaces the stored best but may still produce a share card.
- The mode-selection page links to the full leaderboards.
- A result page shows the top three for the current mode and the current visitor's rank after saving.
- Required explanatory copy:
  - Before saving: `每个模式只展示你的历史最高分；较低成绩不会覆盖最高分，但本次成绩仍可分享。`
  - New best: `New personal best — leaderboard updated.`
  - Lower run: `Your best score remains {score}. This run can still be shared.`

## 3. Non-goals

V1 will not add:

- passwords, magic links, email verification, password reset, or social login;
- public visitor profiles, avatars, follows, likes, or direct messages;
- nested discussions or visitor replies to Julia;
- message images, rich text, external-link previews, or notifications;
- a permanent archive of generated PNG files in D1/R2;
- administrator functions in the public website;
- public access to Guess Where answers or moderation history.

The username-and-email pair is intentionally low assurance. Anyone who knows both can impersonate that visitor. The interface must say so plainly and must not present this as a secure account suitable for private data.

## 4. Architecture and trust boundaries

### 4.1 Public site

The React site renders static photography data as it does today. It calls the Worker only for identity, messages, game sessions, challenges, and leaderboards.

The public site may display only:

- published visitor messages;
- Julia's public reply;
- public username, score, mode, and rank;
- challenge metadata already safe for a player.

It must never receive email verifiers, administrator state, rejected content, private review notes, answer coordinates before a round is submitted, or answer radii outside the existing post-answer result.

### 4.2 Cloudflare Worker and D1

The Worker is authoritative for:

- creating and authenticating lightweight visitor identities;
- issuing and revoking visitor sessions;
- message ownership, moderation state, and public filtering;
- validating that a game session really finished five rounds;
- calculating leaderboard updates from the stored server-side score;
- associating challenges with the authenticated visitor who created them;
- serving Julia's moderation API behind administrator authentication.

No score, rank, ownership field, moderation status, or author name supplied by the browser is trusted without server-side lookup.

### 4.3 Photo Booth

Photo Booth gains a top-level `Messages` workspace. Its React frontend calls only the local FastAPI backend. FastAPI then calls the Worker administrator endpoints with a secret from macOS Keychain.

Photo Booth does not copy visitor identities or messages into local SQLite as a second source of truth. Short-lived response data may be held in memory for rendering, but D1 remains authoritative.

The existing remote endpoint setting is reused. The administrator secret should use a new scoped Keychain entry such as `website_moderation_token`, separate from the AI publishing token in the UI even if both initially resolve to the same Worker secret. This lets the two permissions be separated later without changing the page contract.

### 4.4 Session transport across GitHub Pages and Workers

The production frontend (`juliawangjiayu.github.io`) and a `workers.dev` API are cross-site. Safari and other privacy-preserving browsers may reject a third-party HttpOnly cookie even when `SameSite=None; Secure` is used. V1 therefore uses an opaque bearer session token returned after identity verification and stored by the public client in `localStorage`.

This token is:

- random and unrelated to the username or email;
- stored only as a SHA-256 hash in D1;
- sent in `Authorization: Bearer ...` on authenticated public requests;
- newly generated whenever the visitor signs in again;
- expired after 30 days of inactivity and 90 days absolute;
- removed locally on sign-out or any definitive `401` response.

One identity may have sessions on multiple browsers or devices. A new sign-in does not revoke other devices. At most five unexpired sessions are retained per visitor; creating a sixth revokes the oldest. Signing out revokes only the current token.

This is a conscious compatibility trade-off for the approved GitHub Pages + Worker deployment. The site must use a strict Content Security Policy, render messages as text nodes, avoid injected HTML, and keep third-party scripts to the existing minimum because an XSS bug could read a local-storage token. On GitHub Pages the policy is delivered with an HTML `<meta http-equiv="Content-Security-Policy">`; directives unavailable in a meta policy, such as `frame-ancestors`, are not claimed as V1 protections. If a later host supports response headers, the same policy moves to an HTTP header and adds those header-only directives.

If the site later moves to a custom domain where frontend and API are same-site, the transport should change to a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. The D1 session model and API semantics remain unchanged.

## 5. Data model

Add a new forward-only D1 migration. Existing game data is retained.

### 5.1 `visitors`

| Column | Purpose |
| --- | --- |
| `id` | Random stable visitor ID; primary key. |
| `username` | Display form of the public name. |
| `username_key` | NFKC-normalized, trimmed, case-folded uniqueness key. Unique. |
| `email_verifier` | HMAC-SHA-256 of normalized email using a Worker secret. Unique. |
| `created_at`, `updated_at` | Audit timestamps. |

Email normalization is intentionally conservative: trim surrounding whitespace and lowercase the address. Do not remove dots, plus-tags, or otherwise guess provider-specific equivalence.

The HMAC key is a new Cloudflare secret, `VISITOR_IDENTITY_PEPPER`. It must not reuse `AI_CONFIG_ENCRYPTION_KEY` or `ADMIN_PUBLISH_TOKEN`. The plaintext email is never stored or logged.

Username validation:

- 2–24 user-perceived grapheme clusters after trimming, counted with `Intl.Segmenter` on both client and Worker;
- Unicode letters and numbers are allowed, including Chinese;
- internal single spaces, `_`, and `-` are allowed;
- control characters, emoji-only names, URLs, and leading/trailing separators are rejected;
- reserved-name matching uses the same normalization as uniqueness.

V1 uses a fixed reserved-name list rather than attempting broad Unicode-confusable detection. It reserves separator variants of `Julia Wang` (`julia wang`, `juliawang`, `julia_wang`, and `julia-wang`) plus `admin`, `administrator`, `moderator`, `photo booth`, and `photobooth`. The list is a Worker constant covered by tests and may be extended without a schema change.

Email input is at most 254 characters. After trimming and lowercasing, it must contain one non-empty local part, one `@`, a non-empty domain containing a dot, and no whitespace or control characters. V1 deliberately avoids provider-specific canonicalization and full RFC mailbox parsing.

### 5.2 `visitor_sessions`

| Column | Purpose |
| --- | --- |
| `token_hash` | SHA-256 of the opaque bearer token; primary key. |
| `visitor_id` | Owner, foreign key to `visitors`. |
| `created_at` | Absolute-lifetime origin. |
| `last_seen_at` | Sliding-expiry reference. |
| `expires_at` | Absolute expiry. |

Only the raw token returned once to the browser can authenticate. D1 leakage alone does not reveal usable session tokens.

### 5.3 `comments`

| Column | Purpose |
| --- | --- |
| `id` | Random comment ID. |
| `visitor_id` | Author identity. |
| `target_type` | `photo` or `collection`. |
| `target_id` | Stable Photo Booth/public export ID. |
| `body` | Current plain-text body. |
| `status` | `pending`, `published`, `rejected`, or `deleted`. |
| `created_at`, `updated_at` | Visitor-visible chronology. |
| `published_at` | Most recent approval time, nullable. |
| `moderated_at` | Last administrator action time, nullable. |

Use indexes on `(target_type, target_id, status, created_at)` and `(visitor_id, created_at)`.

Deleting a comment is a soft delete: replace the body with an empty value or move it to an audit-safe tombstone and set `deleted`. Public APIs do not return it. This preserves reply and moderation integrity while avoiding dangling references. Rejected and deleted bodies are not retained indefinitely; a scheduled/manual cleanup may purge them after 30 days.

The moderation state machine is explicit:

- `pending` may become `published`, `rejected`, or `deleted`;
- `published` may become `rejected` (immediate unpublish) or `deleted`;
- a visitor edit from `pending`, `published`, or `rejected` writes the new body and returns the comment to `pending`;
- `rejected` may be approved by Julia until its body is purged, or deleted;
- `deleted` is terminal and cannot be restored;
- a Julia reply is retained but hidden while its parent is pending or rejected, and is purged with a terminal deletion.

### 5.4 `comment_replies`

| Column | Purpose |
| --- | --- |
| `comment_id` | Primary key and foreign key, enforcing at most one reply. |
| `body` | Julia's plain-text reply, at most 500 characters. |
| `created_at`, `updated_at` | Public reply timestamps. |

Replies are visible only while their parent comment is `published`.

### 5.5 `leaderboard_bests`

| Column | Purpose |
| --- | --- |
| `visitor_id`, `mode` | Composite primary key; one best per visitor per mode. |
| `score` | Server-stored completed-session score. |
| `session_id` | Run that established the best. Unique to prevent replay under another identity. |
| `achieved_at`, `updated_at` | Ranking and display timestamps. |

Allowed modes are `easy`, `medium`, `hard`, and `random`. Challenge sessions never enter a leaderboard.

Ranking is score descending, then earliest `achieved_at`, then stable visitor ID. The API returns the public username by joining `visitors`.

### 5.6 Existing session and challenge changes

- Add nullable `claimed_by_visitor_id` and `claimed_at` to `game_sessions`.
- Add nullable `created_by_visitor_id` and `source_session_id` to `challenges`.
- A completed anonymous session may be claimed once by the currently authenticated visitor when they save/share.
- Repeating the same operation by the same visitor is idempotent.
- A different visitor cannot claim that session afterward.
- Challenge score and question IDs are always copied from the server-side completed session, never from request JSON.
- `source_session_id` is unique: one completed source session has one canonical challenge URL. Repeated share-card creation returns that same challenge.
- Challenges do not expire in V1. Removing them later requires an explicit retention product decision and migration.

## 6. Public API

All JSON endpoints enforce a small request-body limit and return structured errors with a stable `code` and human-readable `message`.

### 6.1 Identity

- `POST /api/identity/session`
  - Input: `username`, `email`.
  - Creates or verifies the visitor and issues a new session token.
  - Returns the raw session token once plus `{ visitor: { id, username } }`.
- `GET /api/identity/me`
  - Requires bearer token; returns the public identity.
- `DELETE /api/identity/session`
  - Revokes the current token.

The sign-in/create response must not distinguish `username exists`, `email exists`, or `wrong pair` in a way that enables easy account enumeration. The UI may say: `That username and email do not match an existing identity, or one of them is already in use.`

### 6.2 Messages

- `GET /api/comments?targetType=photo|collection&targetId=...`
  - Public; returns only published comments and visible Julia replies, oldest first.
  - If authenticated, may additionally return that visitor's own pending comments for the same target with an explicit private status.
- `POST /api/comments`
  - Requires identity; input is target type, target ID, and body.
  - Returns a pending comment.
- `PATCH /api/comments/:id`
  - Requires ownership; accepts body only.
  - Published becomes pending and its reply is hidden until re-approval.
- `DELETE /api/comments/:id`
  - Requires ownership; soft deletes.

Target IDs are restricted to the same safe ID format generated by Photo Booth. A forged but well-formed ID can create an orphan pending record, but cannot expose data or create public output without Julia's approval. Photo Booth resolves known IDs against its local catalog and marks unknown targets during moderation.

### 6.3 Results, challenges, and leaderboards

- `POST /api/game/:sessionId/claim`
  - Requires identity and a five-answer completed session.
  - Idempotently binds the session to the visitor.
- `POST /api/challenges`
  - Now requires identity and a claimed completed session.
  - Returns the same public challenge shape plus the creator username needed for the card.
- `PUT /api/leaderboards/:mode/me`
  - Requires identity; input contains only `sessionId`.
  - Performs a transaction-like compare-and-update against the server score.
  - Returns `updated`, `runScore`, `bestScore`, `rank`, and top three.
- `GET /api/leaderboards/:mode?limit=...&cursor=...`
  - Public, paginated, limit capped at 100.
  - Returns public username, score, rank, and achieved date only.
- `GET /api/leaderboards/:mode/me`
  - Requires identity; returns current best and rank.

Claiming occurs inside both save actions if it has not already occurred, so the UI does not expose claim as a separate step.

## 7. Administrator API and Photo Booth

Administrator routes remain under `/api/admin/*` and require a bearer token held only by Photo Booth's FastAPI process.

- `GET /api/admin/comments?status=pending|published|rejected&cursor=...`
- `POST /api/admin/comments/:id/approve`
- `POST /api/admin/comments/:id/reject`
- `DELETE /api/admin/comments/:id`
- `PUT /api/admin/comments/:id/reply`
- `DELETE /api/admin/comments/:id/reply`

The administrator list returns the target type and ID, author username, message/reply bodies, timestamps, and moderation status. It never returns an email or email verifier because neither is needed for moderation.

Photo Booth FastAPI adds matching local proxy endpoints under `/api/messages/*`. It reads the remote endpoint from existing settings and the scoped administrator token from Keychain. Errors are translated into clear local UI states without logging secrets.

The `Messages` page includes:

- sidebar item with pending-count badge;
- default `Pending` filter plus Published and Rejected filters;
- target preview resolved from Photo Booth's local photos and Collections;
- message body, username, age, target, and state;
- Approve, Reject, Delete actions;
- Julia reply editor for published messages;
- clear empty, loading, offline, unauthorized, and remote-not-configured states.

Approve/reject buttons are disabled while the request is in flight and repeated clicks are idempotent.

## 8. Public interface behavior

### 8.1 Identity dialog

The dialog is shared by comments, share cards, and leaderboard saving. It explains why it appeared and preserves the pending action. On success, the dialog closes and the action continues exactly once.

Suggested copy:

> Choose a public username and enter an email you can remember. We use the pair only to recognize you on this site; there is no password or email verification. Anyone who knows both can use the same identity.

The email is never echoed back after submission. The interface offers `Use another identity` / sign out.

### 8.2 Photo and Collection messages

The message trigger stays visually secondary to the photograph and navigation controls but is large enough to discover. Opening it scrolls the expanded panel into view without moving the viewer to a separate route.

Each published entry shows username, date, text, and optional Julia reply. A visitor's own pending entry is visually labelled `Awaiting review` and is never shown to other visitors. Edit/delete controls appear only on the visitor's own entries.

When the photograph changes, the `This photo` tab loads the new target; the `Collection` tab remains on the current Collection. Request cancellation or response identity checks prevent a late response from the previous photograph appearing under the new one.

### 8.3 Result page and share card

The finished score remains the visual focus. Two side-by-side action cards on desktop and stacked cards on mobile distinguish sharing from ranking.

The share card is rendered client-side to Canvas after the server creates the challenge. It uses only same-origin/static visual assets plus generated text and QR pixels, avoiding a cross-origin-tainted canvas. The PNG is not uploaded or stored by the service.

If card rendering fails, the same-five link remains usable and copyable. If system sharing is unavailable or rejects files, download and copy remain available.

The leaderboard preview is fetched independently so its failure does not prevent score display or sharing.

## 9. Validation, abuse resistance, and privacy

- All message content is rendered through React text interpolation, never `dangerouslySetInnerHTML`.
- Server validation trims text, rejects empty/all-whitespace bodies, strips control characters, and enforces 500 characters after normalization.
- URLs remain plain text and receive no automatic anchors.
- Rate-limit identity attempts, comment writes, challenge creation, and leaderboard writes.
- V1 implements inexpensive application limits using D1 timestamps and a daily-rotated HMAC of IP address; raw IP addresses are never stored. Suggested starting limits:
  - 10 identity attempts per IP hash per 15 minutes;
  - 5 new/edited comments per visitor per 10 minutes;
  - 10 challenge creations per visitor per hour;
  - 20 leaderboard save attempts per visitor per hour.
- The IP hashing key is a separate Worker secret or a domain-separated derivation from `VISITOR_IDENTITY_PEPPER`; logs must not print it.
- `ALLOWED_ORIGINS` remains an explicit list. CORS allows `Authorization` and the required GET/POST/PUT/PATCH/DELETE methods; it never reflects an unknown origin.
- Existing administrator and AI secrets remain Cloudflare secrets. Photo Booth copies only administrator integration secrets into macOS Keychain.
- Add a short privacy note near the identity form: plaintext email is not retained; a one-way keyed verifier is used only to recognize the same visitor.
- Because this identity cannot prove mailbox ownership, messages and scores must not be treated as sensitive or legally attributable data.

## 10. Failure behavior

- Worker unavailable: static Collections and photos remain browsable; dynamic panels show a small retry state.
- Identity rejected: the pending action remains queued and the form values remain editable, except the email is cleared after a server response.
- Message submission timeout: do not optimistically add a second copy; retry with an idempotency key.
- Moderation timeout: Photo Booth keeps the item in place and permits retry.
- Leaderboard timeout: the finished run and score remain visible; retrying with the same session is idempotent.
- Challenge creation timeout: retry with an idempotency key so one click cannot create many links.
- Deleted/unknown local target in Photo Booth: show the stable target ID and an `Unknown or no longer local` warning; moderation remains possible.

## 11. Testing strategy

### 11.1 Worker unit/API tests

- username and email normalization, reserved names, unique constraints, and generic mismatch errors;
- HMAC verifier and session-token hashing without exposing raw email/token;
- multiple-device session limits, inactivity/absolute expiry, and current-session revocation;
- public comments return published records only plus the authenticated visitor's own pending records;
- ownership checks for edit/delete and published-edit-to-pending transition;
- one-reply constraint and reply visibility;
- administrator authorization and idempotent moderation;
- completed-session claim rules and prevention of cross-visitor claim;
- leaderboard best-only update, tie ordering, challenge exclusion, and rank pagination;
- challenge content sourced from server session rather than client input;
- CORS origin/header/method behavior;
- rate limits and idempotency keys.

### 11.2 Public React tests

- the identity dialog resumes each of the three triggering actions once;
- message tabs switch targets correctly and stale requests cannot cross photos;
- own pending comments are labelled and public comments are separated;
- result actions remain independent;
- new-best and lower-score copy is correct;
- PNG download, QR/link copy, and Web Share fallbacks;
- anonymous five-round play remains unchanged;
- keyboard focus, dialog escape/return focus, reduced motion, and mobile layout.

### 11.3 Photo Booth tests

- Keychain-backed token never appears in SQLite or frontend responses;
- local proxy request/response/error translation;
- pending badge and filters;
- approve/reject/delete/reply flows;
- unknown target rendering;
- remote offline/unauthorized configuration states.

### 11.4 End-to-end acceptance

1. An anonymous visitor completes five rounds without an identity prompt.
2. They save a leaderboard score, create a new identity, and appear once in the correct mode.
3. A lower replay does not replace that best but still creates a share card and same-five challenge.
4. Another browser opens the challenge and receives exactly the same five photographs.
5. The visitor submits photo and Collection messages; neither is publicly visible.
6. Photo Booth shows both pending items. Julia approves one, rejects one, and replies as `Julia Wang`.
7. Only the approved item and reply become public.
8. The visitor edits it; it disappears publicly and returns to Pending in Photo Booth.
9. No Worker/public response, static export, log, or local SQLite row contains plaintext visitor email or Guess Where private answers.
10. The flow works in current Safari and Chrome using the approved GitHub Pages + Worker split-domain deployment.

## 12. Rollout

1. Add and test the D1 migration and repository contracts.
2. Add identity/session APIs and shared public client session handling.
3. Add message APIs, public message panel, and ownership actions.
4. Add administrator APIs and Photo Booth FastAPI proxy + Messages page.
5. Add session claiming, leaderboards, redesigned result page, and share-card generation.
6. Run local D1 migrations and full automated tests.
7. Configure new Cloudflare secrets and Photo Booth Keychain credential.
8. Deploy Worker first, then static frontend, then enable Photo Booth moderation.
9. Perform the end-to-end acceptance flow before advertising messages or leaderboards.

Existing game sessions, challenges, static photographs, and Collections remain valid. There is no old visitor or message data to migrate.

## 13. Configuration additions

Cloudflare Worker secrets:

- `VISITOR_IDENTITY_PEPPER` — new random secret for email/IP keyed hashing.
- existing `ADMIN_PUBLISH_TOKEN` — may temporarily protect all admin routes, but Photo Booth exposes it under a separate moderation credential field so a scoped token can replace it later.

Worker variables:

- existing `ALLOWED_ORIGINS`, including exact local and production frontend origins.

Photo Booth Keychain:

- `website_moderation_token` — administrator token used only by the local FastAPI proxy.

No visitor email, session token, administrator token, or Guess Where answer is written to static `.env` files, generated JSON, Git, or browser-visible build variables.
