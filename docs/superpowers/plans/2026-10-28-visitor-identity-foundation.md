# Visitor Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the private-email, public-username identity and session foundation required by comments, leaderboards, and persistent share actions.

**Architecture:** Cloudflare Worker owns identity verification, keyed email hashes, rate limits, and opaque sessions in D1. The GitHub Pages React client stores only a random bearer session token and centralizes deferred authenticated actions in one provider/dialog; static photography data remains unchanged.

**Tech Stack:** TypeScript 5.7, Hono, Zod, Cloudflare D1/Web Crypto, React 19, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-visitor-identity-comments-leaderboards-design.md`

## Global Constraints

- Plaintext email must never be stored, logged, exported, or returned after the identity request.
- Normalize email by trim + lowercase only; maximum 254 characters; one `@`, non-empty local part, dotted domain, and no whitespace/control characters.
- Username is 2–24 grapheme clusters, NFKC-normalized, case-insensitively unique, and limited to letters, numbers, internal single spaces, `_`, and `-`.
- Reserve the exact normalized variants listed in the spec; do not invent broad confusable-name blocking.
- Session tokens are random, stored only as SHA-256 hashes in D1, expire after 30 days idle/90 days absolute, and allow at most five active sessions per visitor.
- Production remains GitHub Pages + Cloudflare Worker, so authenticated calls use `Authorization: Bearer`; do not rely on third-party cookies.
- Preserve all current uncommitted photography/catalog/viewer work; do not rewrite or regenerate photo assets.

## Review Focus

- A Unicode username whose code-point count differs from grapheme count is accepted/rejected by the 2–24 grapheme rule (Task 1 test).
- The same normalized email paired with another username returns the same generic mismatch response and leaks neither field match (Task 3 test).
- A sixth browser sign-in revokes only the oldest session, not the other four (Task 2 test).
- An unknown CORS origin never receives an allowed origin value copied from a different site (Task 3 test).
- React Strict Mode or a double form event cannot run the deferred authenticated action twice (Task 4 test).

---

### Task 1: Identity primitives and D1 schema

**Files:**
- Create: `worker/migrations/0003_visitor_identity.sql`
- Create: `worker/src/identity.ts`
- Create: `worker/tests/identity.test.ts`
- Modify: `worker/src/repository.ts`
- Modify: `worker/src/d1Repository.ts`
- Modify: `worker/tests/fakes.ts`

**Interfaces:**
- Consumes: Web Crypto `subtle`, injected `now(): string`, and existing `D1DatabaseLike`.
- Produces: `VisitorRecord`, `VisitorSessionRecord`, `IdentityRepository`, `normalizeUsername(value): NormalizedUsername`, `normalizeEmail(value): string`, `emailVerifier(email, pepper): Promise<string>`, `hashSessionToken(token): Promise<string>`, and `createSessionToken(): string`.

- [ ] **Step 1: Write failing primitive tests**

Add tests named `normalizes multilingual usernames by grapheme`, `rejects reserved and malformed usernames`, `normalizes only the safe email surface`, and `hashes email and session secrets without echoing input`. Assert the exact spec bounds, composed/decomposed Unicode equivalence, deterministic HMAC with domain prefix `email\0`, and a 64-lowercase-hex session hash.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern='username|email|session secrets' worker/tests/*.test.ts tests/*.test.ts`

Expected: FAIL because `worker/src/identity.ts` does not exist.

- [ ] **Step 3: Implement the pure identity interfaces**

Use `Intl.Segmenter('en', { granularity: 'grapheme' })`, NFKC, Unicode property escapes, Web Crypto HMAC-SHA-256, and 32 random bytes encoded as base64url. Export typed validation errors with stable codes `invalid_username`, `reserved_username`, and `invalid_email`.

- [ ] **Step 4: Add the migration and repository contract**

Create `visitors`, `visitor_sessions`, and `rate_limit_events` with the columns/indexes from the spec. Add repository methods with exact names:

```ts
findVisitorByUsernameKey(usernameKey: string): Promise<VisitorRecord | null>
findVisitorByEmailVerifier(verifier: string): Promise<VisitorRecord | null>
createVisitor(visitor: VisitorRecord): Promise<void>
createVisitorSession(session: VisitorSessionRecord): Promise<void>
getVisitorSession(tokenHash: string): Promise<VisitorSessionRecord | null>
touchVisitorSession(tokenHash: string, lastSeenAt: string): Promise<void>
revokeVisitorSession(tokenHash: string): Promise<void>
deleteExpiredVisitorSessions(visitorId: string, now: string): Promise<void>
listVisitorSessions(visitorId: string): Promise<VisitorSessionRecord[]>
deleteVisitorSessions(tokenHashes: string[]): Promise<void>
recordRateLimitEvent(scope: string, subjectHash: string, createdAt: string): Promise<void>
countRateLimitEvents(scope: string, subjectHash: string, since: string): Promise<number>
deleteRateLimitEventsBefore(cutoff: string): Promise<void>
```

- [ ] **Step 5: Extend the memory and D1 repositories and run tests**

Run: `node --test --test-name-pattern='username|email|session secrets' worker/tests/*.test.ts tests/*.test.ts && npm run typecheck`

Expected: focused tests PASS and TypeScript reports no missing repository implementation.

- [ ] **Step 6: Commit**

```bash
git add worker/migrations/0003_visitor_identity.sql worker/src/identity.ts worker/src/repository.ts worker/src/d1Repository.ts worker/tests/identity.test.ts worker/tests/fakes.ts
git commit -m "feat: add visitor identity persistence"
```

### Task 2: Identity service and session lifecycle

**Files:**
- Create: `worker/src/identityService.ts`
- Create: `worker/tests/identityService.test.ts`
- Modify: `worker/src/repository.ts`
- Modify: `worker/tests/fakes.ts`

**Interfaces:**
- Consumes: Task 1 `IdentityRepository` and identity primitives.
- Produces: `IdentityService`, `authenticate(username, email): Promise<IssuedIdentitySession>`, `resolve(token): Promise<VisitorRecord | null>`, `revoke(token): Promise<void>`, and `fingerprintIp(ip, day, pepper): Promise<string>`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover new identity creation, exact-pair sign-in, generic rejection for both username-conflict and email-conflict, five concurrent sessions, sixth-session oldest eviction, 30-day idle expiry, 90-day absolute expiry, current-token-only sign-out, and daily IP fingerprints that contain no raw IP.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test --test-name-pattern='identity service|session lifecycle' worker/tests/*.test.ts`

Expected: FAIL because `IdentityService` is missing.

- [ ] **Step 3: Implement `IdentityService`**

Constructor signature:

```ts
new IdentityService(repository: IdentityRepository, options: {
  pepper: string;
  now: () => Date;
  createId: (kind: 'visitor') => string;
})
```

Use one generic `identity_mismatch` error for either uniqueness conflict. Touch `lastSeenAt` no more than once per hour. On sign-in, delete expired sessions, create a new one, then remove oldest sessions beyond five.

- [ ] **Step 4: Run lifecycle tests**

Run: `node --test --test-name-pattern='identity service|session lifecycle' worker/tests/*.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/identityService.ts worker/src/repository.ts worker/tests/identityService.test.ts worker/tests/fakes.ts
git commit -m "feat: implement visitor session lifecycle"
```

### Task 3: Worker identity API, rate limit, and CORS

**Files:**
- Create: `worker/src/auth.ts`
- Create: `worker/src/rateLimit.ts`
- Modify: `worker/src/app.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/tests/api.test.ts`
- Modify: `wrangler.toml`

**Interfaces:**
- Consumes: Task 2 `IdentityService`.
- Produces: `optionalVisitor(request): Promise<VisitorRecord | null>`, `requireVisitor(request): Promise<VisitorRecord>`, `POST /api/identity/session`, `GET /api/identity/me`, and `DELETE /api/identity/session`.

- [ ] **Step 1: Write failing API and CORS tests**

Assert: valid create/sign-in returns `{ token, visitor: { id, username } }`; responses contain no email/verifier; missing/expired bearer gets `401`; mismatch uses stable code `identity_mismatch`; eleven attempts in fifteen minutes get `429`; allowed origins receive themselves; unknown origins receive no `access-control-allow-origin`; preflight permits `authorization` and GET/POST/PUT/PATCH/DELETE.

- [ ] **Step 2: Run focused API tests and confirm failure**

Run: `node --test --test-name-pattern='identity API|CORS|rate limit' worker/tests/*.test.ts`

Expected: FAIL with missing identity routes and current CORS mismatch.

- [ ] **Step 3: Add authentication and rate-limit helpers**

`auth.ts` parses only `Bearer <token>` and maps auth failures to `{ code, message }`. `rateLimit.ts` exports `enforceRateLimit(repository, { scope, subjectHash, max, windowSeconds, now })`; identity uses scope `identity`, max `10`, window `900` seconds.

- [ ] **Step 4: Wire routes and configuration**

Extend `GameAppOptions` with `visitorIdentityPepper?: string`; extend `createId` to accept `visitor`; add `VISITOR_IDENTITY_PEPPER` to Worker bindings. Return `503 identity_not_configured` when the secret is absent. Change CORS to exact-origin-or-no-header, methods GET/POST/PUT/PATCH/DELETE/OPTIONS, and headers `content-type`, `authorization`, `idempotency-key`.

- [ ] **Step 5: Run API tests, full tests, and typecheck**

Run: `npm test && npm run typecheck`

Expected: all tests PASS; existing game/admin routes remain green.

- [ ] **Step 6: Commit**

```bash
git add worker/src/auth.ts worker/src/rateLimit.ts worker/src/app.ts worker/src/index.ts worker/tests/api.test.ts wrangler.toml
git commit -m "feat: expose visitor identity API"
```

### Task 4: Public client identity provider and deferred-action dialog

**Files:**
- Create: `src/lib/identityApi.ts`
- Create: `src/lib/identityAction.ts`
- Create: `src/components/VisitorIdentityProvider.tsx`
- Create: `src/components/IdentityDialog.tsx`
- Create: `tests/identityAction.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: Task 3 public identity endpoints and `VITE_GAME_API_BASE_URL`.
- Produces: `useVisitorIdentity(): VisitorIdentityContext`, whose stable methods are `runAuthenticated(reason, action): Promise<void>`, `signOut(): Promise<void>`, and whose state is `{ visitor, status: 'loading'|'anonymous'|'authenticated' }`.

- [ ] **Step 1: Write failing deferred-action tests**

Test `IdentityActionCoordinator` directly: anonymous action pauses; successful identity runs it once; cancel runs nothing; second submit while pending runs nothing; authenticated action runs immediately; failed action remains retryable without replaying automatically.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern='identity action' tests/*.test.ts`

Expected: FAIL because `identityAction.ts` is missing.

- [ ] **Step 3: Implement API storage and coordinator**

Use storage key `julia-photo-visitor-session`. `identityApi.ts` owns token read/write/removal and adds the bearer header only to Worker calls. A definitive `401` clears it; network errors do not. Do not store username/email as credentials.

- [ ] **Step 4: Implement provider and accessible dialog**

The dialog carries the reason (`leave a message`, `save to leaderboard`, or `create a share card`), uses the exact low-assurance/privacy copy from the spec, clears email after every server response, traps focus, restores focus on close, and permits sign-out/use-another-identity.

- [ ] **Step 5: Wire provider and style responsive states**

Wrap `<App />` in `VisitorIdentityProvider` in `main.tsx`. Add modal, validation, loading, and error styles without changing existing site typography tokens.

- [ ] **Step 6: Run tests and production build**

Run: `npm test && npm run build`

Expected: tests PASS and Vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/identityApi.ts src/lib/identityAction.ts src/components/VisitorIdentityProvider.tsx src/components/IdentityDialog.tsx tests/identityAction.test.ts src/main.tsx src/styles/global.css src/vite-env.d.ts
git commit -m "feat: add deferred visitor identity dialog"
```

### Task 5: Deployment hardening and identity acceptance

**Files:**
- Modify: `index.html`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/securityConfig.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: documented local/production secret setup and a GitHub-Pages-compatible CSP.

- [ ] **Step 1: Write the failing security-configuration test**

Read `index.html`, `wrangler.toml`, and `.env.example`; assert the CSP has explicit `default-src`, `script-src`, `connect-src`, `img-src`, and `style-src`; assert no secret values are present; assert production and four local origins remain explicitly listed.

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test --test-name-pattern='security configuration' tests/*.test.ts`

Expected: FAIL because no CSP/meta configuration exists.

- [ ] **Step 3: Add the CSP and setup documentation**

Use a meta CSP compatible with Vite's built assets and the configured Google Maps/Worker endpoints. Document `wrangler secret put VISITOR_IDENTITY_PEPPER`, local `.dev.vars`, D1 migration commands, and the fact that `VITE_*` values are public and must never contain the pepper/token.

- [ ] **Step 4: Run full automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Run local acceptance**

Apply the local migration, start Worker on 8787 and Vite on 4173, then verify in Safari and Chrome: create identity, reload and restore it, sign out only current browser, sign in from a second browser, and confirm no plaintext email appears in DevTools responses, Local Storage, generated files, or D1 query output.

- [ ] **Step 6: Commit**

```bash
git add index.html .env.example README.md tests/securityConfig.test.ts
git commit -m "docs: harden visitor identity deployment"
```
