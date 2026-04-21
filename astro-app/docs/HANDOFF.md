# Pantry Plan Migration — Hand-off Prompt

Copy everything below the `---` into a new session to pick up where we left off.

---

You are continuing a multi-phase migration of the **Pantry Plan** recipe/meal-planning app from Next.js (on Vercel/Turso) to **Astro 6 on Cloudflare Workers with D1**. Work happens in the `astro-app/` subdirectory of the `pantry-plan` repo. The existing Next.js app still lives at the repo root for reference — keep it untouched.

## Repo

- Local path: `/Users/jamesqquick/code/pantry-plan`
- Migration work lives in: `/Users/jamesqquick/code/pantry-plan/astro-app/`
- Active branch: `migrate/astro-cloudflare`
- Production URL: `https://pantry-plan.jamesqquick.workers.dev`
- Cloudflare account ID: `4426cbeacb457b1ca1b865d6c36ced0d` (James.q.quick@gmail.com's Account)

## Stack

- **Astro 6** (server output, React integration)
- **Cloudflare Workers** via `@astrojs/cloudflare` v13 adapter
- **Cloudflare D1** (database binding: `DB`, name: `pantry-plan`, id: `c34f212d-1ce2-478a-9366-bb6f764d9f23`) with **Drizzle ORM**
- **Cloudflare KV** session store (auto-provisioned, binding: `SESSION`)
- **Better Auth** (email + password, scrypt via `@noble/hashes` for Workers compatibility)
- **Tailwind CSS v4** with custom design tokens (Potluck Pal warm neutrals + rust primary)
- Fonts: Be Vietnam Pro (body), Lilita One (display) via Astro's built-in Fonts API
- **Vitest** for tests (78 passing)
- **Zod 4** for validation
- Deferred: Workers AI (Phase 12), R2 (Phase 13)

## Phase status

- [x] **Phase 0** — Scaffold Astro 6 on Cloudflare
- [x] **Phase 1** — D1 + Drizzle schema (13 app tables)
- [x] **Phase 2** — Better Auth (email/password, middleware protection, KV-backed sessions)
- [x] **Phase 2.5** — Imported 1053 rows from Turso snapshot into D1
- [x] **Phase 3** — Layouts & navigation (AppHeader, UserMenu, mobile menu with slide animation, 404)
- [x] **Phase 4** — Query-layer library + Zod schemas + 78 Vitest tests
- [x] **Phase 5** — Astro actions: tags, ingredients, recipes, recipeIngredients, orders, mealPlan
- [x] **Phase 6** — Recipe pages (list, detail, create, edit, delete, duplicate)
- [ ] **Phase 7** — Recipe import (URL parsing + AI vision for photo imports) ← **NEXT**
- [ ] **Phase 8** — Ingredients catalog pages
- [ ] **Phase 9** — Orders + cost estimation
- [ ] **Phase 10** — Weekly meal planning calendar
- [ ] **Phase 11** — Profile + password reset flow
- [ ] **Phase 12** — Workers AI integration (replace OpenAI with Llama 4 Scout primary, OpenAI fallback)
- [ ] **Phase 13** — R2 for recipe image uploads (optional enhancement)
- [ ] **Phase 14** — Polish, production hardening, CI

## Key decisions already made

- **ORM**: Drizzle (first-class D1 support, edge-native)
- **Auth**: Better Auth (Astro-recommended, handles email/password + sessions)
- **AI strategy**: Workers AI primary with OpenAI fallback (Phase 12 wires this up; Phase 7 uses OpenAI only since that's what the code is ported from)
- **Password migration**: sentinel scrypt hash on migrated users; they must "forgot password" reset on first login (reset flow itself lands in Phase 11)
- **Project structure**: Astro in subdirectory (`astro-app/`) alongside old Next.js app. Delete Next.js files at the very end.

## Data

- Turso snapshot lives in `astro-app/data/turso-snapshot/` (gitignored — contains bcrypt hashes)
- D1 populated via `data/turso-snapshot/load.sql` (also gitignored)
- Real counts (local + remote D1 both in sync):
  - 4 users (james.q.quick@gmail.com is ADMIN, id `seed_user_001`)
  - 22 recipes for seed_user_001
  - 525 ingredients (506 global + 19 user-owned)
  - 32 aliases, 12 tags, 18 recipe-tag links, 8 orders, 27 order items, 155 instructions, 218 recipe ingredients

### Test account (local + prod)

- Email: `james.q.quick@gmail.com`
- Password: `testpass123` (reset via `npm run reset-password`)
- Role: `ADMIN`

## Running locally

```bash
cd astro-app
npm run dev          # astro dev on port 4321
npm run preview      # wrangler dev against built output (real workerd)
npm run build
npm run deploy       # build + wrangler deploy

# Database
npm run db:generate              # generate Drizzle migration from schema changes
npm run db:migrate:local
npm run db:migrate:remote

# Tests
npm test             # 78 passing

# One-off helpers
npm run reset-password -- --email <email> --password <pw> [--remote]
npm run snapshot:turso           # re-dump production Turso to local JSON
npm run migrate:from-snapshot    # regenerate data/turso-snapshot/load.sql
```

## Secrets

Local secrets live in `astro-app/.dev.vars` (gitignored). Production secrets via `wrangler secret put`:

- `AUTH_SECRET` — Better Auth signing key (set on prod)
- `AUTH_URL` — base URL. Local: `http://localhost:4321`. Prod: `https://pantry-plan.jamesqquick.workers.dev` (declared as a `var` in `wrangler.jsonc`, not a secret)
- `OPENAI_API_KEY` — optional; Phase 7+ features gracefully degrade if unset

## Conventions (established in earlier phases)

- **Actions**: `src/actions/<namespace>.ts`, exported via `src/actions/index.ts` as `server = { tags, ingredients, recipes, ... }`. Each action uses `defineAction({ input, handler })` with Zod schemas from `src/features/`. All use the `requireUser(ctx)` / `requireAdmin(ctx)` helpers from `src/actions/_shared.ts`.
- **D1 client**: `createDb(env.DB)` per-request from `src/db/index.ts`. Never at module scope.
- **Env**: import from `cloudflare:workers` inside request handlers. Never `process.env`.
- **Ownership**: every WHERE clause on user-scoped tables includes `eq(table.userId, user.id)`.
- **React islands**: `src/components/<domain>/*.tsx`. Call actions via `import { actions } from "astro:actions"`. Use `client:load` on Astro pages.
- **Layouts**: `BaseLayout.astro` (HTML shell, dark mode, fonts) → `AppLayout.astro` (auth-gated + AppHeader) → page.
- **Middleware**: `/_actions/*` is a public prefix so XHR auth errors are proper 401 JSON instead of 302 redirects. `requireUser` inside the action handles the real auth check.
- **Design system**: use `btn-primary`/`btn-secondary`/`stat-card` utilities from `globals.css`. Badges use `bg-primary-icon-bg` + `text-primary-icon-fg` (not `text-primary-on-card` — that was the a11y bug we fixed). Display font via `.font-display` for headings.
- **Commit messages**: write substantial bodies explaining the WHY, not just the what. Look at `git log` for the house style.
- **No emojis as icons** — use Lucide SVGs inline (copy path data into the page for zero-dep icons). Emojis OK only as decorative accents.

## Pre-flight before each phase

1. `git status` — should be clean
2. Confirm on `migrate/astro-cloudflare` branch
3. `npm test` — 78 passing
4. `npx astro check` — 0 errors / 0 warnings (13 Zod-v4 deprecation hints are acceptable)
5. Decide scope: **what lands now, what defers to later phases**. Be explicit about deferrals in the commit message.

## What to do first in the new session

Run these to get oriented:

```bash
cd /Users/jamesqquick/code/pantry-plan
git status
git branch --show-current                    # should be migrate/astro-cloudflare
git log --oneline -10
cat astro-app/README.md                      # phase checklist
cat astro-app/docs/HANDOFF.md                # this file
```

Then ask me which phase to tackle next. Default is **Phase 7 (recipe import)**, which should:

1. Port `lib/parse/` (fetch-html, extract-jsonld, normalize-recipe, parse-recipe, iso8601-duration) — the URL parse pipeline. Keep `extract-recipe-from-image-openai.ts` and `map-url-draft-to-structured-openai.ts` for Phase 7 too, gated on `env.OPENAI_API_KEY`.
2. Port the deferred `lib/ingredients/` files: `compute-suggestions.ts`, `llm-ingredient-mapping.ts`, `mapping.ts` — rewrite their DB queries on Drizzle.
3. Port `parse` + `import` + `enhance` + `ingredient-mapping` actions from the Next.js app. Each rewrite from Prisma → Drizzle, `revalidatePath` removed, JSON payloads where nested.
4. Add a URL/image import flow to `/recipes/new`: tabs for "From URL" / "From photo" / "Manual". URL tab: paste URL → call `parse.parseFromUrl` action → show editable draft with suggested ingredient mappings → save. Photo tab: upload image (4MB body limit fine on CF paid plan; 100MB max on free Workers) → `parse.parseFromImage` → same draft UX.
5. Defer **Workers AI fallback** to Phase 12 — OpenAI only for now.
6. Port `parse/normalize-recipe.test.ts` (the 7th test file we deferred in Phase 4).
7. SSRF protection: the existing `fetch-html.ts` blocks localhost/private networks — verify it still works inside `workerd` since DNS resolution is delegated to CF's network.

Always:

- Use the `todowrite` tool to plan the phase.
- Use `question` when a decision branches — don't assume.
- Show `astro check` + `npm test` + `npm run build` green before committing.
- Verify end-to-end on both local wrangler dev and production before declaring done.

## Known warts to keep in mind

- **D1 local state is held open** by `wrangler dev`. Running `wrangler d1 execute ... --local` while dev is up can show stale data. Close dev, run the query, reopen dev — or just query through the app.
- **Zod v4 deprecation hints** (13 total) on `.url()`, `.finite()`, `.ZodIssue`. All still work; they're cosmetic. Leave them until Zod publishes a migration guide.
- **Astro actions serialize responses with devalue** (flat array with back-refs) — not plain JSON. In the browser, destructure `const { data, error } = await actions.x.y(input)`. From curl/scripts, parsing the devalue output by hand is painful; use the actions playground at `/dev/actions` or do writes via the real form UI.
- **Mobile menu animation state machine** (`hidden → entering → open → closing → hidden`) matters for the slide-in/slide-out to work without a flash-of-open-on-mount. Don't collapse back to a single boolean.
- **`user.name` is NOT NULL** in Better Auth's schema, but Turso allowed null. The Phase 2.5 load coalesces null names to the email localpart.
