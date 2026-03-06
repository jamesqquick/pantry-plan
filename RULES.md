# Repository Rules

You are an AI coding agent working in a Next.js repository.

**You MUST follow this file. If anything conflicts, RULES.md wins.**

## Tech + architecture

- **Next.js App Router**
- **Server Components by default**
- **Server Actions for ALL mutations** (no API routes unless explicitly requested)
- **Zod for ALL server-side input validation** (use `safeParse`; map issues to `fieldErrors`)
- **Tailwind CSS** for styling
- **Prisma** for database access (server-only)
- **Auth.js (NextAuth v5)** Credentials for basic email/password auth

## Non-negotiables

- **Never** import server-only modules (Prisma, auth, parse pipeline) into Client Components.
- Client Components are only for interactivity/forms. Keep them small.
- Every server action must: **authenticate**, **authorize**, **validate with Zod**, **mutate**, **revalidate** relevant paths, return **ActionResult**.
- All recipe records are scoped to the authenticated user; enforce **ownership checks** on read/update/delete.
- Recipe parsing is a **security boundary**: prevent SSRF (block localhost/private networks; allow only http/https); parsing output must be treated as **untrusted** and validated again before saving.

## Patterns

- Use **ActionResult\<T\>** and **zodToFieldErrors()** from `lib/action-helpers.ts`.
- Put all server actions in **app/actions/\*.ts** and include `import "server-only";` at top of those files.
- Put Zod schemas in **features/\<domain\>/\*.schemas.ts**.
- Put parsing pipeline under **lib/parse/** (`fetch-html.ts`, `extract-jsonld.ts`, `normalize-recipe.ts`, `parse-recipe.ts`).
- Use **middleware.ts** to protect `/(app)` routes and redirect unauthenticated users to `/login`.

## Quality bar

- Small, cohesive files. Prefer clear names over cleverness.
- Add loading/error/empty states for key pages.
- Ensure accessible forms (labels, aria-invalid, errors).
- Provide "How to verify" steps with each major change.

If something is missing, implement the minimal version that satisfies the above. Do not ask questions; make reasonable assumptions consistent with the rules.

---

## How to verify

1. **Env**: Copy `.env.example` to `.env` and set `AUTH_SECRET` (e.g. `openssl rand -base64 32`). `DATABASE_URL` and `NEXTAUTH_URL` are set for local dev.
2. **DB**: Run `npx prisma migrate dev` if needed. DB is at `prisma/dev.db` (SQLite).
3. **Run**: `npm run dev`, open `http://localhost:3000`.
4. **Auth**: You should be redirected to `/login`. Register a user at `/register`, then sign in. You should land on `/dashboard`.
5. **Recipes**: From dashboard, click “Add recipe”. Create one manually or use “Fetch from URL” with a recipe page that has JSON-LD (e.g. many recipe sites). Submit; you should see the recipe on dashboard and on its detail page.
6. **Ownership**: Recipes are scoped to the signed-in user; only that user’s recipes appear. Update/delete enforce ownership.
7. **Parse security**: Use “Fetch from URL” with `http://localhost` or `http://127.0.0.1`; you should see a “URL not allowed” (or similar) error.
8. **Sign out**: Header “Sign out” should sign you out and redirect to `/login`.
