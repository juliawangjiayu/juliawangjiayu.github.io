# Guess Where Results, Leaderboards, and Two Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve each round's answer reveal, show a five-round review followed by a same-five invitation, let visitors save each as a separate image, and add authenticated best-per-mode leaderboards.

**Architecture:** React sequences the post-answer map reveal and records five post-submit results for an anonymous review. Worker/D1 supplies the Photo Booth answer name only after each submission, validates completed sessions, keeps one canonical challenge per source session, and atomically stores each visitor's best score per mode. The browser renders a spoiler-bearing review image and an answer-free invitation image locally; neither image is uploaded.

**Tech Stack:** TypeScript 5.7, Hono/Zod/D1, React 19, Canvas API, Web Share API, `qrcode`, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-visitor-identity-comments-leaderboards-design.md`

## Global Constraints

- Complete `2026-10-28-visitor-identity-foundation.md` before this plan.
- Playing, viewing the five-round review, and saving its image remain anonymous; identity appears only when creating the persistent same-five invitation or saving to a leaderboard.
- Challenge playback remains anonymous and preserves the exact original five photo IDs in order.
- Easy, Medium, Hard, and Random have separate leaderboards; challenge sessions are never ranked.
- One public row per visitor/mode stores only the historical best; a lower run never overwrites it.
- Tie order is score descending, earliest `achieved_at`, then stable visitor ID.
- One source session has one permanent canonical challenge URL; retries return it idempotently.
- The completed page displays five-round review first, same-five invitation second; each has an independent image-save action. Keep leaderboard saving separate.
- The review image shows each photo, guessed place, actual answer place, round score, and total. It is explicitly marked as containing spoilers near the save/share controls; it contains no raw coordinates, radii, email, or session token.
- The invitation image shows mode, total, QR, and canonical same-five URL. It contains no answers, guessed place names, coordinates, radii, or round results. Public challenge metadata remains answer-free.
- `guess_where_entries.answer_name` is synchronized privately into D1 and released to a visitor only in that round's post-submit result. A searched place uses its selected candidate name; a manually placed Pin uses post-submit reverse geocoding, falling back to `Map Pin` if unresolved.
- Keep the visitor's chosen map camera unchanged when placing or submitting a Pin. On every round, reveal a distinct correct-answer Pin, answer circle, and connecting line. If both Pins are in view, run one short broom-riding witch transition from the visitor's Pin to the correct-answer Pin. If either Pin is outside the current view, show a visible route illustration with the witch flying from the visitor's Pin to the answer. Then emphasize distance, proximity, and score in a panel by the map. An optional `Check correct pin` button lets the visitor choose to fit both Pins into view. Reduced-motion preference skips travel, and animation failure never blocks results or continuation.
- Preserve all existing map, photo zoom/pan, scoring, challenge-start, and AI place-search behavior.

## Review Focus

- Two visitors racing to claim the same anonymous session cannot both own/save/share it (Task 2 test).
- A lower score reports the previous best and rank without changing `session_id` or `achieved_at` (Task 1 test).
- A challenge-mode replay cannot enter any leaderboard even if its score is 25,000 (Task 2 test).
- Repeated invitation clicks or a timeout retry reuse one challenge URL and do not create duplicate rows (Task 2 test).
- A slow or failed map animation still reveals both Pins, distance, score, and Next photograph; reduced motion skips the travel (Task 0 test).
- A manually placed Pin without reverse-geocode results is labelled `Map Pin`, while the actual place uses the post-submit Photo Booth answer name (Tasks 3/3A tests).
- The invitation card and public challenge payload contain no answers, guessed places, coordinates, or radii; the review card may contain answer names and is marked as a spoiler (Task 4 test).

---

### Task 0: Round answer reveal and readable score

**Files:**
- Modify: `src/components/GoogleMapPicker.tsx`
- Modify: `src/lib/googleMaps.ts`
- Modify: `src/pages/GuessWherePage.tsx`
- Modify: `src/styles/global.css`
- Create: `src/lib/answerReveal.ts`
- Test: `tests/answerReveal.test.ts`

**Interfaces:**
- Consumes: existing post-submit `AnswerResult`, player `GuessPoint`, Google Maps marker/circle helpers, and the existing `WitchMotif` visual language.
- Produces: `AnswerRevealPhase = 'answer' | 'travel' | 'score'`, one short transition with cancellation on round change/unmount/map interaction, and a map presentation that keeps both Pins visible.

- [ ] **Step 1: Specify and test the reveal sequence**

Test `answer → travel → score`, new-round and map-interaction cancellation, reduced-motion immediate score, and animation timeout/error fallback. Verify that placing a Pin and submitting it do not change the map's center or zoom; offscreen Pins use the route illustration until the visitor explicitly clicks `Check correct pin`. The score phase exposes Next photograph; neither an animation failure nor a hidden map blocks it. Test that no correct Pin is rendered before the answer response.

- [ ] **Step 2: Keep the two Pins distinct and in frame**

Use separate accessible shapes and labels for `Your Pin` and `Correct answer` (shape as well as color). Keep the existing answer circle. Preserve the visitor's current center and zoom during selection and reveal. Fit the map to both Pins and the circle with sensible padding only when the visitor activates `Check correct pin`.

- [ ] **Step 3: Add one short witch transition from the visitor's Pin**

Draw the connecting line immediately. After the map fits both Pins, project their current screen positions once and move a small version of the existing witch motif from the visitor's Pin to the correct-answer Pin with a CSS transition of about 800 ms. The overlay ignores pointer input; if the visitor pans/zooms during travel, cancel the transition and show the finished result. Cancel on unmount/next round and honor `prefers-reduced-motion`. If projection or overlay setup fails, skip travel and show both Pins, line, distance, and score. No continuously tracked flight path is required.

- [ ] **Step 4: Move proximity and score into a prominent result panel**

Show `Very close` / `Nearby` / `Far away` and the numeric score in a high-contrast panel close to the map, with the distance and clearly labelled Pins. On desktop the score must be visible without looking back to the map heading; on narrow screens it stays next to the map. Keep the result panel visible after animation and make `Next photograph` available.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/answerReveal.test.ts && npm run typecheck && npm run build`

Inspect a near guess, a distant guess, and reduced-motion on desktop and mobile. Commit the Task 0 files separately so the reveal can ship before identity and leaderboards.

### Task 1: Session claim, challenge source, and leaderboard persistence

**Files:**
- Create: `worker/migrations/0005_leaderboards.sql`
- Create: `worker/src/leaderboards.ts`
- Create: `worker/tests/leaderboards.test.ts`
- Modify: `worker/src/repository.ts`
- Modify: `worker/src/d1Repository.ts`
- Modify: `worker/src/challenges.ts`
- Modify: `worker/tests/fakes.ts`
- Modify: `worker/src/sessions.ts`

**Interfaces:**
- Consumes: existing `GameSessionRecord`, `ChallengeStorageRecord`, `GamePhotoRecord`, and visitor IDs.
- Produces: `LeaderboardBestRecord`, `LeaderboardEntry`, `LeaderboardPage`, `SessionClaimResult`, and `LeaderboardRepository` methods used by Task 2.

- [ ] **Step 1: Write failing leaderboard-domain tests**

Test first score insertion, higher-score replacement, lower/equal-score no-op, tie ordering, one row per visitor/mode, challenge-mode rejection, and preservation of original best `sessionId`/`achievedAt` on a lower run.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='leaderboard persistence|leaderboard ordering' worker/tests/*.test.ts`

Expected: FAIL because leaderboard interfaces are missing.

- [ ] **Step 3: Add migration**

Alter `game_sessions` with nullable `claimed_by_visitor_id`, `claimed_at`; alter `challenges` with nullable `created_by_visitor_id`, `source_session_id`; add a unique index on non-null `source_session_id`; create `leaderboard_bests` with composite primary key `(visitor_id, mode)`, unique `session_id`, mode check, score bounds, and ranking index. Add nullable `answer_name` to `game_photos` so previously synchronized rows remain readable until resynced.

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

Update mapping/select/insert statements without exposing claim fields or `answerName` in public round objects. Keep old challenge rows readable when new fields are null. Populate `GamePhotoRecord.answerName` from the private sync payload; a missing older value is handled only after submission.

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
- Modify: `scripts/sync-guess-where.mjs`

**Interfaces:**
- Consumes: Task 1 repository methods and identity-plan `requireVisitor`.
- Produces: implicit session claim in save/share, authenticated challenge creation, and public/per-visitor leaderboard endpoints.

- [ ] **Step 1: Write failing claim/challenge tests**

Assert incomplete sessions return `409`; completed session claims once; same visitor retry succeeds; different visitor receives `409 session_already_claimed`; creating a challenge requires identity; repeated creation returns the same ID; score/question IDs come from server records; public challenge start remains anonymous and answer-safe. Assert `answerName` is absent from start/next-round/challenge responses and present only in the submitted round's response.

- [ ] **Step 2: Write failing leaderboard API tests**

Assert `PUT /api/leaderboards/:mode/me` accepts only `sessionId`, validates five answers and matching mode, rejects challenge mode/cross-mode/client score fields, returns `updated/runScore/bestScore/rank/topThree`; public GET paginates max 100; authenticated GET `/me` returns own best/rank; four modes are isolated.

- [ ] **Step 3: Write rate-limit and privacy tests**

Assert 11th challenge creation/hour and 21st leaderboard write/hour are rejected according to the spec limits; challenge and leaderboard responses contain no question IDs, answer coordinates, radii, email verifier, or session claim internals. The accepted round-answer response retains its existing post-submit answer coordinates and radius.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='session claim|challenge identity|leaderboard API|leaderboard privacy' worker/tests/*.test.ts`

Expected: FAIL against current anonymous challenge endpoint and missing leaderboard routes.

- [ ] **Step 5: Implement one shared claim helper**

Add `claimCompletedSession(sessionId, visitor)` used by both share and leaderboard routes. It verifies exactly five stored answers, disallows `challenge` for ranking, and maps repository outcomes to idempotent success or stable conflict errors.

- [ ] **Step 5a: Synchronize the answer name and reveal it only after submission**

Map Photo Booth's `guess_where_entries.answer_name` to `answerName` in `scripts/sync-guess-where.mjs`, the admin sync schema, and private D1 `game_photos`. Return it alongside `correctAnswer` in the accepted answer response; never include it in `PublicRound`, public challenge metadata, static JSON, or a pre-answer response. For an older D1 row lacking a name, display `Answer location` rather than inventing one. Cover the sync contract and response boundary in Worker tests.

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

### Task 3: Five-round review and independent result actions

**Files:**
- Create: `src/lib/gameResultState.ts`
- Create: `src/lib/roundReview.ts`
- Create: `src/components/GameResult.tsx`
- Create: `src/components/FiveRoundReview.tsx`
- Create: `tests/gameResultState.test.ts`
- Create: `tests/roundReview.test.ts`
- Modify: `src/lib/gameApi.ts`
- Modify: `src/pages/GuessWherePage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: identity-plan `runAuthenticated`, Task 2 API routes, and five post-submit `AnswerResult` values.
- Produces: `RoundReview` (`round`, `photoUrl`, `guessLabel`, `answerLabel`, `score`, `distanceKm`), `GameResultState`, authenticated `createChallenge(sessionId)` and `saveLeaderboardBest(mode, sessionId)`, and `<GameResult />` with review before invitation.

- [ ] **Step 1: Write failing result-state tests**

Cover independent invitation/leaderboard busy/error/success states, five round records appended once, login cancel preserving the finished review, successful login resuming only the requested action, new-best copy, lower-run copy, and an invitation failure not hiding the review or leaderboard state. Verify that a new game clears prior review and invite state. Test that moving a Pin after choosing a search result clears the old place label and a late reverse-geocode response cannot overwrite a newer round.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='game result state' tests/*.test.ts`

Expected: FAIL because the reducer is absent.

- [ ] **Step 3: Extend typed game API and resolve review labels**

Reuse the shared authenticated request helper; add `answerName` to the post-submit `AnswerResult`, plus `LeaderboardSaveResult`, `LeaderboardEntry`, and paginated response types. Keep start/round/answer/challenge-get/challenge-start anonymous. Extend `GoogleMapPicker.onChange` to carry an optional selected Google Places candidate name; clear that name when the Pin is manually moved. For a manually clicked Pin, use Maps geocoding only after submission, never before the visitor confirms. If lookup fails, use `Map Pin` as the guessed label. `answerLabel` uses the server-supplied Photo Booth name or `Answer location` for an older row. Do not send client-derived labels to the score API.

- [ ] **Step 4: Extract `GameResult` from `GuessWherePage`**

Track five `RoundReview` records during the five answers, including photo URL and post-submit labels. Preserve them when advancing rounds. Render the finished total, then the five-round review, then the same-five invitation preview/link section, with independent `Save review image`, `Save invitation image`, and `Save to leaderboard` actions. Show the review without identity; invoke identity only for creating the persistent invitation or saving a score. Add a visible spoiler notice next to the review save/share controls. Use exact leaderboard copy:

- `每个模式只展示你的历史最高分；较低成绩不会覆盖最高分，但本次成绩仍可分享。`
- `New personal best — leaderboard updated.`
- `Your best score remains {score}. This run can still be shared.`

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`

Expected: tests PASS and build succeeds; anonymous five-round flow remains reachable.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gameResultState.ts src/lib/roundReview.ts src/components/GameResult.tsx src/components/FiveRoundReview.tsx tests/gameResultState.test.ts tests/roundReview.test.ts src/lib/gameApi.ts src/pages/GuessWherePage.tsx src/styles/global.css
git commit -m "feat: show five-round review and result actions"
```

### Task 4: Separately downloadable review and invitation images

**Files:**
- Create: `src/lib/reviewCard.ts`
- Create: `src/lib/invitationCard.ts`
- Create: `src/lib/shareResult.ts`
- Create: `src/components/InvitationCardPanel.tsx`
- Create: `tests/resultCards.test.ts`
- Modify: `src/components/GameResult.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 3 `RoundReview[]`, canonical challenge URL, username/mode/total, and existing `qrcode` dependency.
- Produces: `buildReviewCardModel(rounds, total): ReviewCardModel`, `buildInvitationCardModel(input): InvitationCardModel`, independent PNG renderers, `shareOrDownload(result): Promise<'shared'|'downloaded'>`, and `<InvitationCardPanel />`.

- [ ] **Step 1: Write failing card-model and privacy tests**

Assert the 1200×1600 review model has five ordered rows with photo URLs, `guessed place`, `actual answer`, each score, and total; it contains no raw coordinates, radii, email, or session token. Assert the 1200×630 invitation model has mode, total, QR, and canonical URL; it contains no answer/guess names, coordinates, radii, or per-round scores. Ensure the invitation's QR decodes to the same-five URL. Long Chinese and English place names wrap without clipping; an unavailable photo does not prevent a readable review PNG.

- [ ] **Step 2: Write failing fallback-policy tests**

Given mocked capabilities, assert each card can download independently; sharing is offered for each where supported. Rejected/unsupported file sharing falls back to that card's PNG download. Invitation rendering failure still leaves its URL and Copy link available; review rendering failure leaves the on-page five-round review available.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test --test-name-pattern='result cards|share fallback' tests/*.test.ts`

Expected: FAIL because both card modules are absent.

- [ ] **Step 4: Implement both card models and Canvas renderers**

Render the review as a portrait five-row card with same-origin photo thumbnails, place labels, and scores. If a thumbnail cannot load, render that row's number and text so the image can still be saved. Render the invitation as a landscape QR/link card using the existing canonical challenge flow. Draw same-origin photos, local fonts/colors/shapes, and QR pixels only; never draw remote map imagery that can taint Canvas. Return separate PNG Blobs with `julia-wang-guess-where-review-{score}.png` and `julia-wang-guess-where-invite-{mode}-{score}.png` filenames.

- [ ] **Step 5: Implement previews and independent actions**

Show the review and its `Save review image` action first; label its controls `Contains answers — share after friends play`. Below it show the invitation card, QR, visible URL, `Save invitation image`, and `Copy link`. Creating the invitation link may prompt for identity; saving the review image does not. If `navigator.canShare({ files })` succeeds, allow each image to be shared separately; otherwise retain both download buttons and the invitation Copy link. Keep leaderboard save independent.

- [ ] **Step 6: Run tests/build and visually inspect the PNG**

Run: `npm test && npm run build`

Expected: all pass. Generate review and invitation images at 25,000 and a low score; inspect long bilingual place names, five visible scores, legibility, no pronoun challenge text, a valid QR, and no answer clues in the invitation.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reviewCard.ts src/lib/invitationCard.ts src/lib/shareResult.ts src/components/InvitationCardPanel.tsx tests/resultCards.test.ts src/components/GameResult.tsx src/styles/global.css
git commit -m "feat: generate separate Guess Where result cards"
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

Document local/remote `0005` migration commands, required identity/admin secrets from the foundation plan, and deployment order Worker-first then static frontend. State that no answer data belongs in static JSON, invitation-card input, challenge previews, or leaderboard responses; the review-card input receives only post-submit place names and scores.

- [ ] **Step 2: Run complete automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Run anonymous and authenticated regression**

In Safari and Chrome: complete anonymous Easy/Medium/Hard/Random games; verify no login before finish or saving the review image; inspect each round's distinct Pins, witch travel, prominent score, and reduced-motion fallback; cancel identity from invitation and leaderboard actions; save a best; save a lower run; save both images separately; create/recreate one challenge; open QR/link in another browser and confirm exact five photos without answer leakage.

- [ ] **Step 4: Verify score/rank edge cases**

Create tied scores and confirm earliest achievement wins; confirm each mode is isolated; confirm challenge mode cannot save; confirm one username appears once per mode and lower runs leave best timestamp/session unchanged.

- [ ] **Step 5: Audit privacy and storage**

Inspect Worker responses, D1 rows, static build, both PNGs, QR URL, and browser storage. Expected: answer names appear only in post-submit responses and the visitor's own review image; no answers or guessed places in invitation/leaderboard/challenge summaries; no raw coordinates/radii in either PNG; no plaintext email; only opaque visitor token in Local Storage.

- [ ] **Step 6: Commit**

```bash
git add README.md .env.example
git commit -m "docs: explain Guess Where ranking and sharing"
```
