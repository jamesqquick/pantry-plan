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
- **shadcn-style form primitives** (hand-ported `Input`, `Textarea`, `Select`, `Dialog` in `src/components/ui/`)
- **Radix UI** for `Tabs`, `Select`, and `Dialog` (no CLI — components copied into the repo)
- **Vitest** for tests (46 passing)
- **Zod 4** for validation
- **Workers AI** (Llama 4 Scout primary, OpenAI fallback) via `AI` binding
- Deferred: R2 image uploads (cut from scope)

## Phase status

- [x] **Phase 0** — Scaffold Astro 6 on Cloudflare
- [x] **Phase 1** — D1 + Drizzle schema (13 app tables)
- [x] **Phase 2** — Better Auth (email/password, middleware protection, KV-backed sessions)
- [x] **Phase 2.5** — Imported 1053 rows from Turso snapshot into D1
- [x] **Phase 3** — Layouts & navigation (AppHeader, UserMenu, mobile menu with slide animation, 404)
- [x] **Phase 4** — Query-layer library + Zod schemas + 78 Vitest tests
- [x] **Phase 5** — Astro actions: tags, ingredients, recipes, recipeIngredients, orders, mealPlan
- [x] **Phase 6** — Recipe pages (list, detail, create, edit, delete, duplicate)
- [x] **Phase 7** — Recipe import (URL parse + AI vision photo import) + ingredient mapping + shadcn form components
- [x] **Phase 8** — Ingredients catalog pages (list, detail, create, edit, delete)
- [x] **Phase 9** — Orders + cost estimation (list, detail with grocery aggregation, create, edit, delete)
- [x] **Phase 10** — Weekly meal planning calendar (week grid, drag-and-drop, add/edit modal, grocery list)
- [x] **Phase 11** — Profile page (edit name, change password)
- [x] **Phase 12** — Workers AI integration (Llama 4 Scout primary, OpenAI fallback)
- [x] **Phase 13** — Polish, production hardening
  - Accessibility: dark-mode contrast fix, skip-to-content, focus rings on links/danger buttons, combobox ARIA, aria-busy
  - Error boundaries: 500.astro page, improved AI failure messages in import tabs
  - Loading states: shared Spinner component, spinners on import/enhance/mapping buttons
  - View Transitions: Astro ClientRouter for smooth page transitions, softNavigate() for meal-plan mutations
  - Session refresh: profile name update triggers soft-navigate to refresh server props
  - Dead code: removed 1,450 lines (14 files) of unreferenced modules, stale comments
  - Lighthouse: static audit passed — 600KB JS (code-split), 62KB fonts (swap), no CLS/LCP issues
  - Deploy checklist: secrets gitignored, bindings verified, D1 migration stable, observability enabled
- [ ] **Phase 14** — Forgot-password flow (email transport + unauthenticated token-based reset) ← **NEXT**

## Key decisions already made

- **ORM**: Drizzle (first-class D1 support, edge-native)
- **Auth**: Better Auth (Astro-recommended, handles email/password + sessions)
- **AI strategy**: Workers AI primary (`@cf/meta/llama-4-scout-17b-16e-instruct`) with OpenAI `gpt-4o-mini` fallback. Both image extraction and ingredient mapping use the dual-provider pattern. Old OpenAI-only modules are preserved as fallback code paths.
- **Password migration**: sentinel scrypt hash on migrated users; they must use the CLI `npm run reset-password` for now. Forgot-password email flow deferred to Phase 14.5 (needs email transport like Resend or Cloudflare Email Workers).
- **Project structure**: Astro in subdirectory (`astro-app/`) alongside old Next.js app. Delete Next.js files at the very end.
- **Meal plan data fetching**: server-rendered in `.astro` frontmatter (not client-side). Week navigation is full page loads via `<a>` links. Mutations (add/edit/delete/move) call Astro actions from the React island, then `window.location.href` to refresh.
- **Profile password change**: Astro action verifies current password against the `account` table scrypt hash directly (not via Better Auth's `changePassword` API), then hashes and stores the new one. Reuses `hashPassword`/`verifyPassword` exported from `src/lib/auth.ts`.

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
npm test             # 46 passing (39 tests for dead code removed in Phase 13)

# One-off helpers
npm run reset-password -- --email <email> --password <pw> [--remote]
npm run snapshot:turso           # re-dump production Turso to local JSON
npm run migrate:from-snapshot    # regenerate data/turso-snapshot/load.sql
```

## Secrets

Local secrets live in `astro-app/.dev.vars` (gitignored). Production secrets via `wrangler secret put`:

- `AUTH_SECRET` — Better Auth signing key (set on prod)
- `AUTH_URL` — base URL. Local: `http://localhost:4321`. Prod: `https://pantry-plan.jamesqquick.workers.dev` (declared as a `var` in `wrangler.jsonc`, not a secret)
- `OPENAI_API_KEY` — optional fallback; Workers AI is the primary provider. If Workers AI fails, OpenAI is used as fallback when this key is set. Features gracefully degrade if both are unavailable.

## Conventions (established in earlier phases)

- **Actions**: `src/actions/<namespace>.ts`, exported via `src/actions/index.ts` as `server = { tags, ingredients, recipes, ..., profile }`. Each action uses `defineAction({ input, handler })` with Zod schemas from `src/features/`. All use the `requireUser(ctx)` / `requireAdmin(ctx)` helpers from `src/actions/_shared.ts`.
- **D1 client**: `createDb(env.DB)` per-request from `src/db/index.ts`. Never at module scope.
- **Env**: import from `cloudflare:workers` inside request handlers. Never `process.env`.
- **Ownership**: every WHERE clause on user-scoped tables includes `eq(table.userId, user.id)`.
- **React islands**: `src/components/<domain>/*.tsx`. Call actions via `import { actions } from "astro:actions"`. Use `client:load` on Astro pages.
- **Layouts**: `BaseLayout.astro` (HTML shell, dark mode, fonts) → `AppLayout.astro` (auth-gated + AppHeader) → page.
- **Middleware**: `/_actions/*` is a public prefix so XHR auth errors are proper 401 JSON instead of 302 redirects. `requireUser` inside the action handles the real auth check.
- **Design system**: use `btn-primary`/`btn-secondary`/`stat-card` utilities from `globals.css`. Badges use `bg-primary-icon-bg` + `text-primary-icon-fg` (not `text-primary-on-card` — that was the a11y bug we fixed). Display font via `.font-display` for headings.
- **Form primitives**: use `Input` / `Textarea` / `Select` / `Dialog` from `@/components/ui/`. Never write raw `<input>` / `<textarea>` / `<select>` (except the hidden `type="file"` in ImportImageTab). The `Select` is Radix-based — use `<Select value onValueChange>` with `SelectTrigger` + `SelectValue` + `SelectContent` + `SelectItem`, not the native API. `Dialog` is also Radix-based.
- **Cursor/hover**: every interactive element gets `cursor-pointer`. Buttons with hover backgrounds use `hover:bg-primary/10` (subtle rust tint) rather than underlines.
- **Responsive forms**: on mobile all inputs stack full-width; on `sm+` they condense into their intended layout. Pattern: `flex flex-col gap-2 sm:flex-row` with `w-full sm:w-16 sm:shrink-0` sizing per field. Remove buttons become labeled full-width buttons on mobile (with `<span className="sm:hidden">` for the label).
- **Toasts**: hand-rolled inline. State + `useEffect` auto-dismiss (3–4s). Fixed-position div at bottom center with `animate-toast-in` class. Green bg for success, destructive for error.
- **Commit messages**: write substantial bodies explaining the WHY, not just the what. Look at `git log` for the house style.
- **No emojis as icons** — use Lucide SVGs inline (copy path data into the page for zero-dep icons). Emojis OK only as decorative accents.

## Pre-flight before each phase

1. `git status` — should be clean
2. Confirm on `migrate/astro-cloudflare` branch
3. `npm test` — 46 passing
4. `npx astro check` — 0 errors / 0 warnings (14 Zod-v4 / FormEvent deprecation hints are acceptable)
5. Decide scope: **what lands now, what defers to later phases**. Be explicit about deferrals in the commit message.

## What shipped in Phase 13 (latest session)

Phase 13 — Polish, production hardening (8 commits):

1. **Accessibility audit** — dark-mode `--primary-on-background` bumped to 48% lightness (5.1:1 contrast). Skip-to-content link in BaseLayout. Focus rings on all `<a>` links and danger/ghost-danger Button variants. Combobox ARIA on meal plan recipe search. `aria-busy` on submit buttons.
2. **Error boundaries** — `src/pages/500.astro` for uncaught server errors. Import tabs show structured error messages with headings and fallback suggestions for AI failures.
3. **Loading states** — `src/components/ui/Spinner.tsx` shared component with `role="status"`. Spinners on import URL button, enhance button. Replaced hand-rolled spinners in ImportImageTab and RecipeDraftEditor.
4. **View Transitions** — `<ClientRouter />` in BaseLayout for smooth `<a>` navigations. `src/lib/navigate.ts` `softNavigate()` helper for React islands. Meal plan mutations use softNavigate instead of hard reload.
5. **Session refresh** — ProfileForm soft-navigates after name update (1.2s delay) so server re-reads updated name from DB.
6. **Dead code cleanup** — deleted 14 files / 1,450 lines of unreferenced modules and their tests. Removed stale comments in `_shared.ts`, `actions/index.ts`, `canonical.ts`, `wrangler.jsonc`.
7. **Lighthouse audit** — static analysis passed. 600KB JS (code-split into ~30 chunks), 62KB fonts (woff2, swap), no CLS/LCP issues, no render-blocking resources.
8. **Deploy checklist** — secrets gitignored, bindings verified against env.d.ts, D1 migration stable (0000_init.sql only), observability enabled, 404-page handling configured.

## What to do first in the new session

Run these to get oriented:

```bash
cd /Users/jamesqquick/code/pantry-plan
git status
git branch --show-current                    # should be migrate/astro-cloudflare
git log --oneline -10
cat astro-app/docs/HANDOFF.md                # this file
```

Then ask me which phase to tackle next. Default is **Phase 14 (Forgot-password flow)**, which should:

1. Set up email transport (Resend or Cloudflare Email Workers).
2. Implement token-based password reset (generate token, send email, verify token, reset password).
3. Unauthenticated `/forgot-password` and `/reset-password?token=...` pages.
4. Rate-limit reset requests to prevent abuse.

Always:

- Use the `todowrite` tool to plan the phase.
- Use `question` when a decision branches — don't assume.
- Show `astro check` + `npm test` + `npm run build` green before committing.
- Verify end-to-end on both local wrangler dev and production before declaring done.

## Known warts to keep in mind

- **D1 local state is held open** by `wrangler dev`. Running `wrangler d1 execute ... --local` while dev is up can show stale data. Close dev, run the query, reopen dev — or just query through the app.
- **Zod v4 deprecation hints** (11 total after dead code removal) on `.url()`, `.finite()`, `.ZodIssue`. All still work; they're cosmetic. Leave them until Zod publishes a migration guide.
- **React.FormEvent deprecation hints** (2 in profile components, 1 in AddOrEditMealModal) — TypeScript cosmetic warning, functions identically. Fix when React 20+ types land.
- **Astro actions serialize responses with devalue** (flat array with back-refs) — not plain JSON. In the browser, destructure `const { data, error } = await actions.x.y(input)`. From curl/scripts, parsing the devalue output by hand is painful; use the actions playground at `/dev/actions` or do writes via the real form UI.
- **Mobile menu animation state machine** (`hidden → entering → open → closing → hidden`) matters for the slide-in/slide-out to work without a flash-of-open-on-mount. Don't collapse back to a single boolean.
- **`user.name` is NOT NULL** in Better Auth's schema, but Turso allowed null. The Phase 2.5 load coalesces null names to the email localpart.
- **Meal plan mutations use softNavigate** (`src/lib/navigate.ts`) which leverages the Navigation API from Astro's ClientRouter. Falls back to `window.location.href` on unsupported browsers. Data refresh still requires server round-trip (not optimistic).
- **Workers AI binding warning in local dev** — wrangler emits "AI bindings always access remote resources" warning during `astro dev` and `astro build`. This is informational; AI calls in local dev hit Cloudflare's remote AI inference and may incur usage charges.
