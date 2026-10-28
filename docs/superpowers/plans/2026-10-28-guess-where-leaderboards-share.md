# Guess Where Leaderboards and Share Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve anonymous five-round play while adding authenticated best-per-mode leaderboards and downloadable same-five challenge share cards.

**Architecture:** Worker/D1 validates completed sessions, claims each run to one visitor, keeps one canonical challenge per source session, and atomically stores only a visitor's best score per mode. React splits the finished-game UI into result, ranking, and sharing components; the browser renders a 1200×630 PNG locally and never uploads it.

**Tech Stack:** TypeScript 5.7, Hono/Zod/D1, React 19, Canvas API, Web Share API, `qrcode`, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-visitor-identity-comments-leaderboards-design.md`

## Global Constraints

- Complete `2026-10-28-visitor-identity-foundation.md` before this plan.
- Playing and viewing all five round results remains anonymous; identity appears only after `Create share card` or `Save to leaderboard`.
- Challenge playback remains anonymous and preserves the exact original five photo IDs in order.
- Easy, Medium, Hard, and Random have separate leaderboards; challenge sessions are never ranked.
- One public row per visitor/mode stores only the historical best; a lower run never overwrites it.
- Tie order is score descending, earliest `achieved_at`, then stable visitor ID.
- One source session has one permanent canonical challenge URL; retries return it idempotently.
- The share card contains username, mode, total, five round scores, QR, and URL—never answers, coordinates, radii, or place names.
- Preserve all existing map, photo zoom/pan, scoring, challenge-start, and AI place-search behavior.

## Review Focus

- Two visitors racing to claim the same anonymous session cannot both own/save/share it (Task 2 test).
- A lower score reports the previous best and rank without changing `session_id` or `achieved_at` (Task 1 test).
- A challenge-mode replay cannot enter any leaderboard even if its score is 25,000 (Task 2 test).
- Repeated share-card clicks or a timeout retry reuse one challenge URL and do not create duplicate rows (Task 2 test).
- The generated card model and serialized API payload contain no answer coordinates/radii/place names (Task 4 test).

---

### Task 1: Session claim, challenge source, and leaderboard persistence

**Files:**
- Create: `worker/migrations/0005_leaderboards.sql`
- Create: `worker/src/leaderboards.ts`
- Create: `worker/tests/leaderboards.test.ts`
- Modify: `worker/src/repository.ts`
- Modify: `worker/src/d1Repository.ts`
- Modify: `worker/src/challenges.ts`
- Modify: `worker/tests/fakes.ts`

**Interfaces:**
- Consumes: existing `GameSessionRecord`, `ChallengeStorageRecord`, and visitor IDs.
- Produces: `LeaderboardBestRecord`, `LeaderboardEntry`, `LeaderboardPage`, `SessionClaimResult`, and `LeaderboardRepository` methods used by Task 2.

- [ ] **Step 1: Write failing leaderboard-domain tests**

Test first score insertion, higher-score replacement, lower/equal-score no-op, tie ordering, one row per visitor/mode, challenge-mode rejection, and preservation of original best `sessionId`/`achievedAt` on a lower run.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='leaderboard persistence|leaderboard ordering' worker/tests/*.test.ts`

Expected: FAIL because leaderboard interfaces are missing.

- [ ] **Step 3: Add migration**

Alter `game_sessions` with nullable `claimed_by_visitor_id`, `claimed_at`; alter `challenges` with nullable `created_by_visitor_id`, `source_session_id`; add a unique index on non-null `source_session_id`; create `leaderboard_bests` with composite primary key `(visitor_id, mode)`, unique `session_id`, mode check, score bounds, and ranking index.

- [ ] **Step 4: Define repository interfaces**

Add exact methods:

```ts
claimGameSession(sessionId: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult>
getChallengeBySourceSessionId(sessionId: string): Promise<ChallengeStorageRecord | null>
saveBestScore(candidate: LeaderboardBestRecord): Promise<{ updated: boolean; best: LeaderboardBestRecord }>
getVisitorBest(visitorId: string, mode: GameMode): Promise<LeaderboardBestRecord | null>
listLeaderboard(mode: GameMode, cursor: string | null, limit: number): Promise<LeaderboardPage>
getLeaderboardRank(mode: GameMode, visitorId: string): Promise<number | null>
```

Extend session/challenge records with the nullable ownership/source fields. `saveBestScore` must use one D1 batch/conditional upsert so concurrent lower scores cannot replace a higher one.

- [ ] **Step 5: Implement D1 and memory repositories**

Update mapping/select/insert statements without exposing claim fields in public round objects. Keep old challenge rows readable when new fields are null.

- [ ] **Step 6: Run tests and typecheck**

Run: `node --test --test-name-pattern='leaderboard persistence|leaderboard ordering' worker/tests/*.test.ts && npm run typecheck`

Expected: focused tests PASS and no repository mismatch.

- [ ] **Step 7: Commit**

```bash
git add worker/migrations/0005_leaderboards.sql worker/src/leaderboards.ts worker/src/repository.ts worker/src/d1Repository.ts worker/src/challenges.ts worker/tests/leaderboards.test.ts worker/tests/fakes.ts
git commit -m "feat: persist Guess Where leaderboard bests"
```

### Task 2: Claim, challenge, and leaderboard APIs

**Files:**
- Modify: `worker/src/app.ts`
- Modify: `worker/tests/api.test.ts`
- Modify: `worker/tests/challenge.test.ts`
- Modify: `worker/tests/privacy.test.ts`

**Interfaces:**
- Consumes: Task 1 repository methods and identity-plan `requireVisitor`.
- Produces: implicit session claim in save/share, authenticated challenge creation, and public/per-visitor leaderboard endpoints.

- [ ] **Step 1: Write failing claim/challenge tests**

Assert incomplete sessions return `409`; completed session claims once; same visitor retry succeeds; different visitor receives `409 session_already_claimed`; creating a challenge requires identity; repeated creation returns the same ID; score/question IDs come from server records; public challenge start remains anonymous and answer-safe.

- [ ] **Step 2: Write failing leaderboard API tests**

Assert `PUT /api/leaderboards/:mode/me` accepts only `sessionId`, validates five answers and matching mode, rejects challenge mode/cross-mode/client score fields, returns `updated/runScore/bestScore/rank/topThree`; public GET paginates max 100; authenticated GET `/me` returns own best/rank; four modes are isolated.

- [ ] **Step 3: Write rate-limit and privacy tests**

Assert 11th challenge creation/hour and 21st leaderboard write/hour are rejected according to the spec limits; no response contains question IDs, answer coordinates, radii, email verifier, or session claim internals.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='session claim|challenge identity|leaderboard API|leaderboard privacy' worker/tests/*.test.ts`

Expected: FAIL against current anonymous challenge endpoint and missing leaderboard routes.

- [ ] **Step 5: Implement one shared claim helper**

Add `claimCompletedSession(sessionId, visitor)` used by both share and leaderboard routes. It verifies exactly five stored answers, disallows `challenge` for ranking, and maps repository outcomes to idempotent success or stable conflict errors.

- [ ] **Step 6: Replace challenge creation contract**

Keep `POST /api/challenges` body `{ sessionId }`, require bearer identity, claim if necessary, return existing challenge by `source_session_id` or create one. Response adds creator username but never question IDs.

- [ ] **Step 7: Implement leaderboard routes**

Add `PUT /api/leaderboards/:mode/me`, `GET /api/leaderboards/:mode`, and `GET /api/leaderboards/:mode/me`. Resolve rank after compare/update; cap limit at 100; cursor encodes the last `(score, achievedAt, visitorId)` tuple and is treated as opaque by clients.

- [ ] **Step 8: Run full Worker verification**

Run: `npm test && npm run typecheck`

Expected: all tests PASS, including updated existing challenge test.

- [ ] **Step 9: Commit**

```bash
git add worker/src/app.ts worker/tests/api.test.ts worker/tests/challenge.test.ts worker/tests/privacy.test.ts
git commit -m "feat: secure challenges and leaderboard APIs"
```

### Task 3: Result action state and authenticated game client

**Files:**
- Create: `src/lib/gameResultState.ts`
- Create: `src/components/GameResult.tsx`
- Create: `tests/gameResultState.test.ts`
- Modify: `src/lib/gameApi.ts`
- Modify: `src/pages/GuessWherePage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: identity-plan `runAuthenticated` and Task 2 API routes.
- Produces: `GameResultState`, `reduceGameResult(state, action)`, authenticated `createChallenge(sessionId)`, `saveLeaderboardBest(mode, sessionId)`, and `<GameResult />`.

- [ ] **Step 1: Write failing result-state tests**

Cover independent share/save busy/error/success states, five round scores appended once, login cancel preserving the finished score, successful login resuming only the requested action, new-best copy, lower-run copy, and a share failure not hiding leaderboard state.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='game result state' tests/*.test.ts`

Expected: FAIL because the reducer is absent.

- [ ] **Step 3: Extend typed game API**

Reuse the shared authenticated request helper; add `LeaderboardSaveResult`, `LeaderboardEntry`, and paginated response types. Keep start/round/answer/challenge-get/challenge-start anonymous.

- [ ] **Step 4: Extract `GameResult` from `GuessWherePage`**

Track `roundScores: number[]` during the five answers and pass mode/session/total/scores/shared-challenge comparison to `GameResult`. Render finished score first, then two independent actions. Use exact copy:

- `每个模式只展示你的历史最高分；较低成绩不会覆盖最高分，但本次成绩仍可分享。`
- `New personal best — leaderboard updated.`
- `Your best score remains {score}. This run can still be shared.`

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`

Expected: tests PASS and build succeeds; anonymous five-round flow remains reachable.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gameResultState.ts src/components/GameResult.tsx tests/gameResultState.test.ts src/lib/gameApi.ts src/pages/GuessWherePage.tsx src/styles/global.css
git commit -m "feat: split Guess Where result actions"
```

### Task 4: Privacy-safe 1200×630 share card and sharing fallbacks

**Files:**
- Create: `src/lib/shareCard.ts`
- Create: `src/lib/shareResult.ts`
- Create: `src/components/ShareCardPanel.tsx`
- Create: `tests/shareCard.test.ts`
- Modify: `src/components/GameResult.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: canonical challenge URL/username/mode/total/five scores from Task 3 and existing `qrcode` dependency.
- Produces: `buildShareCardModel(input): ShareCardModel`, `renderShareCardPng(model): Promise<Blob>`, `shareOrDownload(result): Promise<'shared'|'downloaded'>`, and `<ShareCardPanel />`.

- [ ] **Step 1: Write failing card-model/privacy tests**

Assert model dimensions are 1200×630; exactly five scores; total, username, mode, QR URL; no photo answers/place fields; serialized model does not match `/latitude|longitude|radius|answer|place/i`; challenge URL is canonical and repeated model creation is deterministic.

- [ ] **Step 2: Write failing fallback-policy tests**

Given mocked capabilities, assert Web Share with files is preferred; rejected/unsupported file share falls back to PNG download plus copyable link; rendering failure still leaves the challenge URL available.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='share card|share fallback' tests/*.test.ts`

Expected: FAIL because share modules are absent.

- [ ] **Step 4: Implement card model and Canvas renderer**

Draw only local fonts/colors/shapes, supplied text, and QR pixels; do not draw remote map/photo imagery that can taint Canvas. Return PNG Blob; use filename `julia-wang-guess-where-{mode}-{score}.png`.

- [ ] **Step 5: Implement panel and fallback actions**

Show an on-page card preview, QR, visible URL, `Share`, `Download card`, and `Copy link`. If `navigator.canShare({ files })` succeeds, share PNG + link; otherwise download and retain explicit copy button.

- [ ] **Step 6: Run tests/build and visually inspect the PNG**

Run: `npm test && npm run build`

Expected: all pass. Generate one 1200×630 card at 25,000 and one at a low score; verify legibility, no pronoun challenge text, valid QR, and no correct-answer clues.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shareCard.ts src/lib/shareResult.ts src/components/ShareCardPanel.tsx tests/shareCard.test.ts src/components/GameResult.tsx src/styles/global.css
git commit -m "feat: generate Guess Where share cards"
```

### Task 5: Full leaderboards and result preview

**Files:**
- Create: `src/pages/LeaderboardPage.tsx`
- Create: `src/components/LeaderboardTable.tsx`
- Create: `src/lib/leaderboardState.ts`
- Create: `tests/leaderboardState.test.ts`
- Modify: `src/router.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/GuessWherePage.tsx`
- Modify: `src/components/GameResult.tsx`
- Modify: `src/styles/global.css`
- Modify: `tests/router.test.ts`

**Interfaces:**
- Consumes: Task 2 public leaderboard API and Task 3 save result.
- Produces: route `/guess-where/leaderboards/:mode`, mode tabs, paginated table, and result top-three/current-rank preview.

- [ ] **Step 1: Write failing router and state tests**

Assert all four mode routes parse/encode safely; invalid modes are not found; pages append without duplicate visitor rows; mode switch resets cursor; lower-run response preserves prior best; unavailable leaderboard data does not alter finished score/share state.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='leaderboard route|leaderboard state' tests/*.test.ts`

Expected: FAIL because route/state are absent.

- [ ] **Step 3: Implement route and full leaderboard page**

Render Easy/Medium/Hard/Random tabs, ranked username/score/date rows, Load more pagination, loading/empty/retry states, and no profile links. Add a visible full-leaderboard entry from Guess Where mode selection.

- [ ] **Step 4: Add result preview**

After save, show current mode top three and current visitor rank. Fetch errors remain local to the preview and never disable share/download or remove the result.

- [ ] **Step 5: Run tests/build and responsive check**

Run: `npm test && npm run build`

Expected: all pass. Verify table and result cards at desktop and ≤680px, keyboard navigation, and focus after mode changes.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LeaderboardPage.tsx src/components/LeaderboardTable.tsx src/lib/leaderboardState.ts tests/leaderboardState.test.ts src/router.ts src/App.tsx src/pages/GuessWherePage.tsx src/components/GameResult.tsx src/styles/global.css tests/router.test.ts
git commit -m "feat: add Guess Where leaderboards"
```

### Task 6: Migration, regression, and cross-browser acceptance

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: deployable D1/Worker/client release with documented operating steps.

- [ ] **Step 1: Document migration and secrets**

Document local/remote `0005` migration commands, required identity/admin secrets from the foundation plan, and deployment order Worker-first then static frontend. State that no answer data belongs in static JSON or share-card input.

- [ ] **Step 2: Run complete automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Run anonymous and authenticated regression**

In Safari and Chrome: complete anonymous Easy/Medium/Hard/Random games; verify no login before finish; cancel identity from each result action; save a best; save a lower run; create/recreate one challenge; open QR/link in another browser and confirm exact five photos.

- [ ] **Step 4: Verify score/rank edge cases**

Create tied scores and confirm earliest achievement wins; confirm each mode is isolated; confirm challenge mode cannot save; confirm one username appears once per mode and lower runs leave best timestamp/session unchanged.

- [ ] **Step 5: Audit privacy and storage**

Inspect Worker responses, D1 rows, static build, generated PNG, QR URL, and browser storage. Expected: no answer coordinates/radii/place names in cards/leaderboards/challenge summaries, no plaintext email, and only opaque visitor token in Local Storage.

- [ ] **Step 6: Commit**

```bash
git add README.md .env.example
git commit -m "docs: explain Guess Where ranking and sharing"
```
