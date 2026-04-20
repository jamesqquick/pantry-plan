# Pantry Plan — Astro 6 on Cloudflare

Migration target for the Pantry Plan app. See the root repo for the current Next.js app.

## Stack

- **Astro 6** (server output) with React integration
- **Tailwind CSS v4** with shadcn-style design tokens (Potluck Pal)
- **Cloudflare Workers** (via `@astrojs/cloudflare` v13 adapter)
- **Cloudflare KV** for Astro sessions (auto-provisioned as `SESSION`)
- **Cloudflare D1** with **Drizzle ORM** (bound as `DB`)
- **Better Auth** (email/password) with scrypt via `@noble/hashes` (Workers-compatible)
- Coming in later phases: **Workers AI**, **R2**

## Scripts

```bash
npm run dev              # Astro dev server (workerd runtime)
npm run build            # Build for production
npm run preview          # Preview built output with wrangler dev
npm run deploy           # Build + deploy to Cloudflare Workers
npm run cf-typegen       # Regenerate worker-configuration.d.ts from wrangler.jsonc

# Database (D1 + Drizzle)
npm run db:generate      # Generate SQL migration from schema changes
npm run db:migrate:local # Apply migrations to local D1
npm run db:migrate:remote # Apply migrations to remote D1
npm run db:studio        # Open Drizzle Studio (requires CLOUDFLARE_* env vars)

# Tests (Vitest)
npm test                 # Run all tests once
npm run test:watch       # Watch mode
```

## Local setup

1. `cp .dev.vars.example .dev.vars` and fill in secrets
2. `npm run dev` — starts Astro dev server on port 4321 (falls through to 4322+ if busy)
3. `npm run preview` — runs the built app against real `workerd` runtime

## Deployment

Deployed at: https://pantry-plan.jamesqquick.workers.dev

Bindings:

- `DB` — D1 database `pantry-plan` (id: `c34f212d-1ce2-478a-9366-bb6f764d9f23`)
- `SESSION` — KV namespace for Astro sessions
- `IMAGES` — Cloudflare Images
- `ASSETS` — static assets

## Verification pages (auth-protected)

- `/dev/db-test` — renders ingredient catalog from D1 to prove Drizzle → D1
- `/dev/auth-debug` — dumps the current session, user/session/account table rows

## Auth

Email/password via **Better Auth** (`src/lib/auth.ts`). Sessions stored in the
D1 `session` table, keyed by a `better-auth.session_token` cookie. Password
hashes live in `account.password` (scrypt via `@noble/hashes`).

Secrets required:

```bash
# Local: put in astro-app/.dev.vars
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:5175"   # match the port wrangler dev uses

# Production: set via wrangler
wrangler secret put AUTH_SECRET
```

`AUTH_URL` for production is set as a `var` in wrangler.jsonc (not a secret).

## Data migration from Turso

Two-step process: snapshot the live Turso DB to local JSON, then transform
that into a D1-compatible SQL file and apply it.

```bash
# 1. Capture snapshot (read-only; requires ../.env with TURSO_* vars)
npm run snapshot:turso

# 2. Generate load.sql from the snapshot
npm run migrate:from-snapshot

# 3. Apply to local D1
npx wrangler d1 execute pantry-plan --local --file=data/turso-snapshot/load.sql

# 4. Apply to remote D1 (production)
npx wrangler d1 execute pantry-plan --remote --file=data/turso-snapshot/load.sql
```

The snapshot dir and `load.sql` are both gitignored (they contain real user
data). Every migrated user gets a sentinel `account.password` that always
fails scrypt verification — they must use "forgot password" on first login.
(bcrypt hashes from Turso can't be re-wrapped as scrypt.)

## Migration Phases

- [x] **Phase 0** — Scaffolding, design tokens, deploy
- [x] **Phase 1** — D1 + Drizzle ORM schema
- [x] **Phase 2** — Better Auth (email + password, middleware protection)
- [x] **Phase 2.5** — Data migration: import Turso snapshot into D1 (1053 rows)
- [x] **Phase 3** — Layouts & navigation (header, user menu, mobile menu, 404)
- [x] **Phase 4** — Query-layer library + Zod schemas + test suite (78 tests passing)
- [ ] **Phase 4** — Query layer & utilities
- [ ] **Phase 5** — Astro actions
- [ ] **Phase 6** — Recipe pages
- [ ] **Phase 7** — Recipe import (URL + AI)
- [ ] **Phase 8** — Ingredients catalog
- [ ] **Phase 9** — Orders & grocery lists
- [ ] **Phase 10** — Meal planning
- [ ] **Phase 11** — Profile & settings
- [ ] **Phase 12** — Workers AI integration
- [ ] **Phase 13** — R2 storage (optional)
- [ ] **Phase 14** — Polish & production
