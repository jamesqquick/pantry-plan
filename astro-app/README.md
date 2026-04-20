# Pantry Plan — Astro 6 on Cloudflare

Migration target for the Pantry Plan app. See the root repo for the current Next.js app.

## Stack

- **Astro 6** (server output) with React integration
- **Tailwind CSS v4** with shadcn-style design tokens (Potluck Pal)
- **Cloudflare Workers** (via `@astrojs/cloudflare` v13 adapter)
- **Cloudflare KV** for Astro sessions (auto-provisioned as `SESSION`)
- **Cloudflare D1** with **Drizzle ORM** (bound as `DB`)
- Coming in later phases: **Better Auth**, **Workers AI**, **R2**

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

## Verification pages

- `/dev/db-test` — renders ingredient catalog from D1 to prove the Drizzle → D1 pipeline works

## Data migration from Turso

We captured a one-time snapshot of the existing production Turso database
to use as input for the D1 data migration in Phase 2.5.

```bash
# Requires ../.env with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
npm run snapshot:turso
```

This dumps all 13 tables to `data/turso-snapshot/*.json` (gitignored —
contains bcrypt hashes and real user data). Re-run any time for a fresh
snapshot. The migration itself (Phase 2.5) will transform these JSON
files into D1 inserts once the final User schema is locked in by Phase 2.

## Migration Phases

- [x] **Phase 0** — Scaffolding, design tokens, deploy
- [x] **Phase 1** — D1 + Drizzle ORM schema
- [ ] **Phase 2** — Better Auth
- [ ] **Phase 2.5** — Data migration: import Turso snapshot into D1
- [ ] **Phase 3** — Layouts & navigation
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
