# Julia Wang Personal Website V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the publishable personal photography site with real Photo Booth exports, a quiet responsive interface, and a private-answer Guess Where runtime.

**Architecture:** A React + Vite + TypeScript static client is deployed to the root GitHub Pages user site. Photo Booth supplies versioned public JSON and optimized images; a separate Cloudflare Worker + D1 boundary owns all private Guess Where answers, sessions, scoring, AI search fallback, and challenge records.

**Tech Stack:** React 19, Vite 6, TypeScript 5.7, CSS, Node test runner, Cloudflare Workers, D1, Google Maps JavaScript/Places, DeepSeek fallback.

**Spec:** `docs/superpowers/specs/2026-10-20-personal-website-v1-design.md` (pointer to the approved project spec)

## Global Constraints

- Photography leads; Home, Collections, Guess Where, and About are the only primary destinations.
- Preserve every photograph's orientation and aspect ratio; never stretch images.
- Homepage photographs and Collection covers randomize once per page entry and remain static during that visit.
- Public photo Info may contain only capture date, device, tags, and description; empty fields disappear.
- Public files and pre-answer API payloads never contain answer coordinates, answer radii, canonical answer internals, original paths, hashes, review state, or secrets.
- Original photographs are never modified or uploaded; only optimized derivatives are public.
- Guess Where uses one confirmed coordinate for both text-assisted and direct Pin answers and one server-side scoring function.
- GitHub Pages direct routes must survive refresh; Collections remain usable when the Worker is unavailable.

## Review Focus

- Empty or partially populated Photo Booth exports must render without blank metadata labels or broken page layouts.
- Re-entering a page may choose new random images, but rerendering or interacting within the page must not reshuffle them.
- Portrait and landscape images must keep natural ratios at desktop and mobile widths without clipping adjacent controls.
- A replayed or duplicate Guess Where submission must not award a second score or reveal an answer before the first accepted submission.
- Provider/Worker failure must leave manual Pin entry and the static photography archive usable.

---

### Task 1: Repository, public catalog, and privacy contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/content/types.ts`, `src/content/catalog.ts`, `src/lib/stableSelection.ts`
- Create: `src/generated/photography.json`, `src/generated/collections.json`, `public/photos/*`
- Test: `tests/catalog.test.ts`, `tests/stableSelection.test.ts`, `tests/publicPayload.test.ts`

**Interfaces:**
- Produces: `getCollections(): CollectionView[]`, `getHomepagePhotos(count: number, seed?: number): PublicPhoto[]`, `stableSample<T>(items: readonly T[], count: number, seed: number): T[]`.
- Photo Booth generated JSON remains the only ordinary catalog input.

- [ ] Write catalog, stable-selection, and forbidden-public-field tests first.
- [ ] Run the tests and confirm they fail because the modules do not exist.
- [ ] Add the minimal scaffold and typed catalog adapters.
- [ ] Export optimized derivatives and public JSON from Photo Booth, then assert recursively that no forbidden key exists.
- [ ] Run all Task 1 tests and the TypeScript build.
- [ ] Commit the independently usable data/scaffold slice.

### Task 2: Shared shell, Homepage, and provisional About

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`, `src/router.ts`, `src/styles/tokens.css`, `src/styles/global.css`
- Create: `src/components/SiteHeader.tsx`, `src/pages/HomePage.tsx`, `src/pages/AboutPage.tsx`, `src/content/about.ts`
- Test: `tests/router.test.ts`, `tests/homeComposition.test.ts`, `tests/aboutContent.test.ts`

**Interfaces:**
- Consumes: `getHomepagePhotos` from Task 1.
- Produces: browser-history routes `/`, `/collections`, `/guess-where`, and `/about`; shared `SiteHeader`.

- [ ] Write routing, static-per-entry Homepage composition, and empty-About-section tests first.
- [ ] Run the tests and confirm expected missing-module failures.
- [ ] Implement the route state, shared shell, Homepage statement/photo composition, and replaceable About content module.
- [ ] Run the focused tests, full test suite, and production build.
- [ ] Commit the shell/Home/About slice.

### Task 3: Collections path

**Files:**
- Create: `src/pages/CollectionsPage.tsx`, `src/components/CollectionPath.tsx`, `src/lib/pathLayout.ts`
- Modify: `src/styles/global.css`
- Test: `tests/pathLayout.test.ts`, `tests/collectionCovers.test.ts`

**Interfaces:**
- Consumes: `getCollections` and each Collection's `photos`.
- Produces: `buildPathLayout(count: number): PathNode[]` and links to `/collections/:id`.

- [ ] Write tests for ten-plus nodes, alternating generous placement, and stable once-per-entry covers.
- [ ] Run the tests and confirm the missing behavior.
- [ ] Implement the rounded SVG route and responsive Collection nodes without image stretching.
- [ ] Run focused tests, full suite, and build.
- [ ] Commit the Collections index slice.

### Task 4: Horizontal Collection album and large Info card

**Files:**
- Create: `src/pages/CollectionPage.tsx`, `src/components/PhotoViewer.tsx`, `src/components/PhotoInfoCard.tsx`, `src/lib/photoInfo.ts`, `src/lib/swipe.ts`
- Modify: `src/styles/global.css`
- Test: `tests/photoInfo.test.ts`, `tests/viewerState.test.ts`, `tests/swipe.test.ts`

**Interfaces:**
- Consumes: typed Collection data and route parameters.
- Produces: previous/next navigation, zoom reset on photo change, toolbar visibility, and filtered Info rows.

- [ ] Write tests for wraparound navigation, zoom reset, empty-field hiding, and swipe thresholds.
- [ ] Run and observe expected failures.
- [ ] Implement the centered natural-ratio viewer, adjacent previews, 44px toolbar, and fixed larger Info card.
- [ ] Run focused tests, full suite, build, and keyboard/mobile smoke checks.
- [ ] Commit the Collection detail slice.

### Task 5: Guess Where Worker contract and player

**Files:**
- Create: `worker/src/index.ts`, `worker/src/scoring.ts`, `worker/src/sessions.ts`, `worker/src/providers.ts`, `worker/migrations/0001_init.sql`, `wrangler.toml`
- Create: `src/pages/GuessWherePage.tsx`, `src/game/api.ts`, `src/game/state.ts`, `src/components/GuessMap.tsx`, `src/components/ScoreCard.tsx`
- Test: `tests/scoring.test.ts`, `tests/gameState.test.ts`, `tests/workerPrivacy.test.ts`, `tests/challenge.test.ts`

**Interfaces:**
- Produces: start/load/answer/challenge endpoints with opaque IDs; `scoreGuess(distanceKm, radiusKm): ScoreResult`; client game reducer for exactly five rounds.
- Consumes: D1 private game rows, restricted Google key, tested active DeepSeek configuration, and confirmed player coordinate.

- [ ] Write scoring monotonicity/cutoff, five-unique-round, one-submit-only, challenge determinism, and pre-answer privacy tests.
- [ ] Run and confirm the tests fail for missing modules.
- [ ] Implement pure scoring/session logic, then D1-backed Worker routes with fake-provider injection.
- [ ] Implement the combined search/Pin confirmation player and unavailable-service fallback.
- [ ] Run unit/contract tests, local Worker integration tests, full suite, and build.
- [ ] Commit the complete game slice without real coordinates or keys.

### Task 6: Deployment, direct-link fallback, and final browser verification

**Files:**
- Create: `.github/workflows/deploy-pages.yml`, `scripts/create-pages-fallback.mjs`, `README.md`
- Create: `e2e/site.spec.ts`, `playwright.config.ts`
- Modify: `package.json`, `vite.config.ts`

**Interfaces:**
- Consumes: all routes and Worker base URL.
- Produces: GitHub Pages artifact with root/custom-domain support and documented Cloudflare bindings.

- [ ] Write direct-route fallback and browser-flow tests before the fallback/build behavior.
- [ ] Implement the Pages workflow and 404 bootstrap, then document local and production configuration.
- [ ] Run full unit tests, Worker tests, production build, and browser tests covering Home, Collections, both orientations, Info, five game rounds, and challenge replay.
- [ ] Audit built files for secrets and forbidden private fields.
- [ ] Request a fresh whole-branch code review and fix Critical/Important findings through RED→GREEN tests.
- [ ] Commit the verified deployment slice; do not push or publish until separately confirmed.
