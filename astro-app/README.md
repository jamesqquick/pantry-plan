# Pantry Plan — Astro 6 on Cloudflare

Migration target for the Pantry Plan app. See the root repo for the current Next.js app.

## Stack

- **Astro 6** (server output) with React integration
- **Tailwind CSS v4** with shadcn-style design tokens (Potluck Pal)
- **Cloudflare Workers** (via `@astrojs/cloudflare` v13 adapter)
- **Cloudflare KV** for Astro sessions (auto-provisioned as `SESSION`)
- Coming in later phases: **D1** (database), **Drizzle ORM**, **Better Auth**, **Workers AI**, **R2**

## Scripts

```bash
npm run dev        # Astro dev server (workerd runtime)
npm run build      # Build for production
npm run preview    # Preview built output with wrangler dev
npm run deploy     # Build + deploy to Cloudflare Workers
npm run cf-typegen # Regenerate worker-configuration.d.ts from wrangler.jsonc
```

## Local setup

1. `cp .dev.vars.example .dev.vars` and fill in secrets
2. `npm run dev` — starts Astro dev server on port 4321 (falls through to 4322+ if busy)
3. `npm run preview` — runs the built app against real `workerd` runtime

## Deployment

Deployed at: https://pantry-plan.jamesqquick.workers.dev

Auto-provisioned bindings:

- `SESSION` (KV namespace) — for Astro sessions
- `IMAGES` — Cloudflare Images binding
- `ASSETS` — static assets

## Migration Phases

- [x] **Phase 0** — Scaffolding, design tokens, deploy
- [ ] **Phase 1** — D1 + Drizzle ORM schema
- [ ] **Phase 2** — Better Auth
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
