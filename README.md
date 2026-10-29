# Julia Wang — photography site

The public site is a React + Vite application. Guess Where runs through a Hono Cloudflare Worker backed by D1 so its answer coordinates and accepted radii never enter the public bundle.

## Local frontend

Copy `.env.example` to `.env.local`, add the Google Maps browser key and Map ID, then run:

```sh
npm install
npm run dev -- --port 4173
```

Google Cloud must enable **Maps JavaScript API** and **Places API (New)**. Restrict the browser key to those APIs and to the local and published site referrers.

## Local Guess Where Worker

Copy `.dev.vars.example` to `.dev.vars`, use a long random admin publishing token, and run:

```sh
npm run db:migrate:local
npm run worker:dev
```

To copy confirmed private game answers from Photo Booth into local D1 without writing them into the repository:

```sh
PHOTO_BOOTH_DB="/absolute/path/to/studio.sqlite3" \
PHOTO_SITE_ADMIN_TOKEN="the-same-token-as-.dev.vars" \
npm run sync:game -- --endpoint http://127.0.0.1:8787
```

Use `--dry-run` to report mode counts without sending records. The sync script logs only counts; coordinates remain in Photo Booth, the authenticated request, and D1.

### Local AI configuration

The editable model, prompt, timeout, and retry settings stay in Photo Booth SQLite. Saving a draft does not change either website environment. After that exact draft passes a test and is activated, start the local Worker and run:

```sh
npm run sync:ai-config
```

The command defaults to the sibling `../photo-booth/.local/studio.sqlite3`, reads only the immutable active version, gets `ADMIN_PUBLISH_TOKEN` from this repository's `.dev.vars`, and publishes to `http://127.0.0.1:8787`. It never reads the Photo Booth draft or macOS Keychain. The local Worker reads `DEEPSEEK_API_KEY` separately from `.dev.vars`.

Use overrides only when the folders or port differ:

```sh
PHOTO_BOOTH_DB="/absolute/path/to/studio.sqlite3" \
PHOTO_SITE_ADMIN_TOKEN="the-same-token-as-.dev.vars" \
npm run sync:ai-config -- --endpoint http://localhost:8787
```

## Where website data comes from

| Data | Local website test | Online website |
| --- | --- | --- |
| Public Collections, homepage choices, and public photo metadata | Generated public catalog and optimized files in `src/generated` and `public/photos` | The same reviewed static export deployed with GitHub Pages |
| Guess Where answers and accepted radii | Active records copied from Photo Booth SQLite by `npm run sync:game` into local D1 | The same private subset published to production D1 |
| AI prompt, model, timeout, and retries | Active Photo Booth version copied by `npm run sync:ai-config` into local D1 | Active version published from Photo Booth to the HTTPS Worker endpoint |
| DeepSeek API key | Website `.dev.vars` | Cloudflare Secret, unless explicitly rotated from Photo Booth |
| Player sessions, scores, and challenge links | Local D1 created by the local Worker | Production D1 created by the deployed Worker |

Photo Booth SQLite is the private authoring source. Local and production D1 are intentionally small runtime replicas, not shared physical databases: a deployed Cloudflare Worker cannot open a SQLite file on a Mac, and the public runtime should not receive Photo Booth drafts or unrelated administration data.

The production D1 `database_id` is committed in `wrangler.toml`; secret values remain outside Git.

## Production deployment

The production Worker is deployed at:

`https://julia-photo-guess.juliawangjiayu-github-io.workers.dev`

Apply committed D1 migrations and deploy the Worker with the three values in the ignored `.dev.vars` file uploaded as Cloudflare Secrets:

```sh
npx wrangler d1 migrations apply julia-photo-guess --remote
npx wrangler deploy --secrets-file .dev.vars
```

Publish the reviewed private game subset from Photo Booth after every game-data change:

```sh
PHOTO_BOOTH_DB="../photo-booth/.local/studio.sqlite3" \
PHOTO_SITE_ADMIN_TOKEN="the-same-token-as-.dev.vars" \
npm run sync:game -- \
  --endpoint https://julia-photo-guess.juliawangjiayu-github-io.workers.dev
```

After a Photo Booth AI configuration has been tested and activated, publish that exact immutable version with:

```sh
PHOTO_SITE_WORKER_URL="https://julia-photo-guess.juliawangjiayu-github-io.workers.dev" \
npm run sync:ai-config
```

The production sync accepts only the named HTTPS `workers.dev` Worker origin; redirects, arbitrary hosts, credentials, paths, query strings, and fragments are rejected before the publisher token is sent.

GitHub Pages deploys from `main` through `.github/workflows/deploy-pages.yml`. Configure these GitHub Actions secrets before the first Pages run:

- `VITE_WORKER_BASE_URL`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_GOOGLE_MAP_ID`
