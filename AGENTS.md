# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Pantry Plan is an Astro 6 recipe/meal-planning app on Cloudflare Workers. See `README.md` for scripts and `docs/HANDOFF.md` for architecture details.

### Dev server

Run `npm run dev` to start the Astro dev server on port 4321 (local workerd runtime). The `astro.config.mjs` sets `remoteBindings: false` so the dev server starts without Cloudflare authentication. AI, rate-limiting, and feature-flag bindings degrade gracefully when absent.

### Database

Cloudflare D1 is emulated locally by wrangler (SQLite in `.wrangler/state/`). Run `npm run db:migrate:local` to apply migrations before first use. **Do not** run `wrangler d1 execute --local` while the dev server is running — it can show stale data. Stop the dev server first, run the query, then restart.

### Auth

The app uses Better Auth (email/password). Local secrets go in `.dev.vars` (gitignored). Copy `.dev.vars.example` and set `AUTH_SECRET` (generate with `openssl rand -base64 32`). `AUTH_URL` should be `http://localhost:4321`.

### Tests

`npm test` runs Vitest (71 tests). Tests do not require the dev server or database — they test pure logic and schemas.

### Type checking

`npx astro check` requires Cloudflare authentication for the remote proxy (AI binding). Without CF login, it fails. Cloudflare-specific types (`cloudflare:workers`, `D1Database`, `Ai`, etc.) are not available via raw `tsc`. This is expected in cloud agent environments without CF credentials.

### Build

`npm run build` compiles successfully through the Vite build phase but the prerender step fails without Cloudflare auth. The dev server (`npm run dev`) is the primary way to test changes locally.

### Key gotchas

- The first page load after starting the dev server may take several seconds while Vite optimizes dependencies.
- Astro actions serialize responses with devalue (not plain JSON). Use the app UI or `/dev/actions` playground for testing actions.
- If you encounter a blank white page or "jsxDEV is not a function" error, restart the dev server — this is a Vite dependency optimization issue that resolves on restart.
