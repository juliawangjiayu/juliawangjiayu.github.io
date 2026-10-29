# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the complete photography site from `main` to GitHub Pages and deploy the Guess Where API, private game data, and active AI configuration to Cloudflare Worker + D1.

**Architecture:** Cloudflare Worker + D1 deploy first so the frontend can be built with its final HTTPS API URL. GitHub Actions then builds the Vite client from `main`, creates the GitHub Pages SPA fallback, and deploys only `dist`; browser-visible Google Maps values and the Worker URL enter the build through repository secrets, while private Worker values remain Cloudflare secrets.

**Tech Stack:** React 19, Vite 6, TypeScript 5.7, Node test runner, GitHub Actions/Pages, Cloudflare Workers, Wrangler 4, D1.

**Spec:** `docs/superpowers/specs/2026-10-20-personal-website-v1-design.md` and Task 6 of `docs/superpowers/plans/2026-10-20-personal-website-v1.md`

## Global Constraints

- Keep private answer coordinates, accepted radii, admin tokens, encryption keys, DeepSeek credentials, and Photo Booth internals out of Git and the public Pages artifact.
- Publish only optimized derivatives and reviewed public JSON from this repository.
- Use `main` as the stable production branch while retaining `feature/site-v1` as development history.
- GitHub Pages direct routes must load through `404.html`; the site remains browsable if the Worker is unavailable.
- Cloudflare accepts requests only from local development origins and `https://juliawangjiayu.github.io`.
- Do not rewrite the three existing local commits; preserve their commit identities when pushing.

## Review Focus

- A direct request to `/collections/<id>`, `/guess-where`, or `/about` must bootstrap the same Vite app instead of showing GitHub's 404 page.
- The Pages workflow must build only from `main`, use the current official Vite Pages actions, and upload `dist` rather than source files.
- A production build must not contain `.dev.vars`, Photo Booth database paths, private answer coordinates, or secret names with their values.
- The Worker must bind the created production D1 database and reject origins outside the explicit allowlist.
- Published game data must contain at least five enabled questions in every difficulty and the live API must not reveal answers before submission.

---

### Task 1: Cloudflare production database and Worker

**Files:**
- Modify: `wrangler.toml`
- Create: `tests/deploymentConfig.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `worker/migrations/*.sql`, `.dev.vars`, `../photo-booth/.local/studio.sqlite3`, and the existing Worker routes.
- Produces: a deployed HTTPS Worker URL and migrated D1 database used by Task 2.

- [ ] **Step 1: Write a failing production-config test**

  Assert that `wrangler.toml` has a non-placeholder D1 UUID, the `DB` binding, the expected database name, migrations directory, and the exact production Pages origin in `ALLOWED_ORIGINS`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test tests/deploymentConfig.test.ts`

  Expected: FAIL because `database_id` is still `00000000-0000-0000-0000-000000000000`.

- [ ] **Step 3: Create and bind the production D1 database**

  Run `npx wrangler whoami`, then `npx wrangler d1 create julia-photo-guess --location apac`; write the returned UUID to `wrangler.toml` without changing the binding or allowlist.

- [ ] **Step 4: Verify configuration GREEN and Worker build**

  Run: `node --test tests/deploymentConfig.test.ts && npx wrangler deploy --dry-run`

  Expected: the focused test passes and Wrangler builds the Worker without uploading it.

- [ ] **Step 5: Migrate, set secrets, deploy, and seed production**

  Apply migrations with `npx wrangler d1 migrations apply julia-photo-guess --remote`; upload `ADMIN_PUBLISH_TOKEN`, `AI_CONFIG_ENCRYPTION_KEY`, and `DEEPSEEK_API_KEY` from `.dev.vars` through Wrangler without printing values; deploy the Worker; publish the 39 confirmed game records and the immutable active AI configuration to the returned HTTPS URL.

- [ ] **Step 6: Document production operations and verify the live privacy contract**

  Add exact deploy/sync commands to `README.md`; confirm every difficulty has at least five enabled questions, start a live game, and verify the start payload contains no answer coordinates or radius.

- [ ] **Step 7: Commit the Cloudflare deployment slice**

  Commit `wrangler.toml`, `tests/deploymentConfig.test.ts`, and `README.md` with message `chore: configure production worker deployment`.

### Task 2: GitHub Pages workflow and direct-route fallback

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `scripts/create-pages-fallback.mjs`
- Create: `tests/pagesDeployment.test.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the production Worker URL from Task 1 plus the existing Google Maps browser key and Map ID in `.env.local`.
- Produces: a `dist/404.html` SPA fallback and a GitHub Pages workflow that injects the three public build values from repository secrets.

- [ ] **Step 1: Write failing fallback and workflow tests**

  Assert that the fallback script copies an existing `dist/index.html` byte-for-byte to `dist/404.html`; the workflow triggers on `main`, grants `pages: write` and `id-token: write`, runs `npm ci` plus `npm run build`, supplies `VITE_WORKER_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, and `VITE_GOOGLE_MAP_ID`, and uploads `./dist` with the official Vite action revisions.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `node --test tests/pagesDeployment.test.ts`

  Expected: FAIL because the fallback module and workflow do not exist.

- [ ] **Step 3: Implement the fallback and workflow**

  Export `createPagesFallback(outputDirectory = 'dist')` from `scripts/create-pages-fallback.mjs`, call it when the script runs directly, register it as `postbuild`, and add `.github/workflows/deploy-pages.yml` using the current Vite official Pages workflow revisions.

- [ ] **Step 4: Verify GREEN and audit the artifact**

  Run: `node --test tests/pagesDeployment.test.ts && npm test && npm run typecheck && npm run build`

  Expected: all tests pass, the build succeeds, and `dist/404.html` matches `dist/index.html`.

  Search `dist` for the three private Worker secret values, Photo Booth paths, private answer field names, and localhost Worker URLs; expected result is no match.

- [ ] **Step 5: Commit the Pages deployment slice**

  Commit the workflow, fallback script, tests, `package.json`, lockfile if changed, and `README.md` with message `chore: add GitHub Pages deployment`.

### Task 3: Publish `main` and verify production end to end

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: verified commits from Tasks 1 and 2, the production Worker URL, and local browser-visible Google Maps values.
- Produces: GitHub default branch `main`, configured Pages secrets, a successful Pages deployment, and a verified public site.

- [ ] **Step 1: Finish the interrupted feature push without rewriting history**

  Verify remote `feature/site-v1` equals local `952b873` or later; use the repository-scoped temporary SSH deployment key only for the large initial transfer and delete it immediately afterward.

- [ ] **Step 2: Create and push `main`**

  Create local `main` at the verified deployment commit, push it to `origin/main`, and update the repository default branch to `main` while retaining `feature/site-v1`.

- [ ] **Step 3: Configure Pages and repository secrets**

  Set Pages build type to GitHub Actions and create `VITE_WORKER_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, and `VITE_GOOGLE_MAP_ID` as Actions secrets without printing their values.

- [ ] **Step 4: Observe deployment and verify public behavior**

  Wait for the Pages workflow to complete; open `https://juliawangjiayu.github.io`, direct-load `/collections`, `/guess-where`, and `/about`, then play one live Guess Where round through answer submission and confirm scoring works.

- [ ] **Step 5: Final branch verification**

  Run `git status --short --branch`, compare local and remote `main`, confirm the temporary deploy key is gone, and run the full local verification suite once more before declaring deployment complete.
