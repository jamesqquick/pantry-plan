---
name: new-feature-worktree
description: >-
  Implements a new feature in a dedicated git worktree on a feature/ branch,
  validates (tests, lint, build as appropriate), runs Prisma generate before
  commit, pushes and opens a PR, then opens the worktree folder in a new
  Cursor instance when possible. Use when the user wants a worktree-based
  feature workflow, or mentions implementing a feature in a separate worktree
  with a pull request.
---

# New feature (worktree workflow)

When this skill applies, follow the workflow below **in order**. All implementation work happens **only** in the worktree, not the original checkout.

## Inputs

You may receive:

- A feature name or branch slug (e.g. `mobile-nav` or `feature/mobile-nav`)
- A description of what to build

**Branch naming:** If the name does not start with `feature/`, prefix it: `feature/<name>`.

---

## 1) Repository root and base branch

```bash
git rev-parse --show-toplevel
```

Save as `REPO_ROOT`.

```bash
git fetch origin main
```

Set `BASE_BRANCH` to the starting point branch for the feature:

- Default: `main`
- If the user explicitly specifies another starting branch (for example: "starting branch: develop" or "base branch: release/1.2"), use that value instead.

Create `BASE_REF="origin/${BASE_BRANCH}"` (remote ref).

If `BASE_REF` does not resolve (missing remote branch), stop and explain.

Always fetch the starting branch too (unless it is `main`, which was already fetched):

```bash
git fetch origin "$BASE_BRANCH"
```

If this fails, stop and report.

Derive:

- `REPO_NAME` = basename of `REPO_ROOT`
- `WORKTREE_PARENT` = dirname of `REPO_ROOT`

---

## 2) Feature branch and worktree path

- `FEATURE_BRANCH` = provided branch if it already starts with `feature/`, else `feature/<provided-name>`
- Sanitize the slug (no `..`, no absolute paths, reasonable charset).

Path (bash-style):

```text
WORKTREE_PATH="${WORKTREE_PARENT}/${REPO_NAME}--${FEATURE_BRANCH#feature/}"
```

Example: repo `pantry-plan`, branch `feature/order-export` → `.../pantry-plan--order-export`.

---

## 3) Create branch and worktree

- If **`FEATURE_BRANCH` does not exist** locally:

  ```bash
  git worktree add -b "$FEATURE_BRANCH" "$WORKTREE_PATH" "$BASE_REF"
  ```

- If it **already exists**:

  ```bash
  git worktree add "$WORKTREE_PATH" "$FEATURE_BRANCH"
  ```

  Before proceeding, confirm the existing `FEATURE_BRANCH` includes `BASE_REF`:
  
  - If not, stop and explain (or ask the user if you should recreate the feature branch from `BASE_REF`).

After this, **do all file edits and commands from step 5 onward only in `WORKTREE_PATH`**, not in `REPO_ROOT`.

---

## 4) Copy `.env` into worktree (if needed)

If `$REPO_ROOT/.env` exists and `$WORKTREE_PATH/.env` does not:

```bash
cp "$REPO_ROOT/.env" "$WORKTREE_PATH/.env"
```

---

## 5) Work in the worktree

```bash
cd "$WORKTREE_PATH"
```

Install dependencies if needed (`npm install`, etc.).

---

## 6) Implement

- Inspect the codebase and repo rules (e.g. `.cursor/rules`, `RULES.md`).
- Draft a short plan, then implement.
- Change only what the feature requires; match existing patterns.

Do not stop after planning unless blocked by a real error.

---

## 7) Validate

Run what the repo provides, for example:

- `npm test` / `pnpm test` / `vitest`
- `npm run lint`
- `npm run build` or `tsc --noEmit`

Skip commands that do not exist; do not invent scripts.

---

## 8) Prisma generate before commit

From the worktree:

```bash
npx prisma generate
```

If the project’s Prisma config requires a database URL for the CLI (e.g. this repo’s `prisma.config.ts`), set the env var the project documents—often `PRISMA_DATABASE_URL=file:./prisma/dev.db` for local SQLite—then run generate again.

If generate fails: report the error; do not claim success. Include any generated tracked files in the commit.

---

## 9) Review

```bash
git status
git diff --stat
```

Summarize: files changed, what was implemented, validation run, Prisma result.

---

## 10) Commit

```bash
git add -A
git commit -m "feat: ${FEATURE_BRANCH#feature/}"
```

Use a more specific `feat(scope): …` message if the repo consistently does. If there is nothing to commit, say so clearly.

---

## 11) Push

```bash
git push -u origin "$FEATURE_BRANCH"
```

On failure, stop and report.

---

## 12) Pull request

Check `command -v gh`.

If `gh` is available and authenticated, create a PR **into `BASE_BRANCH`**:

**Title:** `feat: ${FEATURE_BRANCH#feature/}` (adjust to match repo conventions if needed)

**Body template:**

```markdown
## Summary
- [What changed]

## Validation
- [Commands run]
- `npx prisma generate` (and env if used)

## Notes
- [Follow-ups, risks, or issues]
```

Example:

```bash
gh pr create --base "$BASE_BRANCH" --head "$FEATURE_BRANCH" \
  --title "feat: ${FEATURE_BRANCH#feature/}" \
  --body-file -   # or pass --body with the filled template
```

If `gh` is missing or auth fails: state that the PR was not created; give the push URL / compare link if useful.

---

## 13) Open worktree in a new Cursor instance

After the PR exists (or push succeeded), open **`WORKTREE_PATH`** in a **new** Cursor window so the user can continue in the feature branch checkout without switching the primary repo window.

**macOS (preferred):**

```bash
open -na "Cursor" --args "$WORKTREE_PATH"
```

If that fails or does nothing, try:

```bash
open -a "Cursor" "$WORKTREE_PATH"
```

**If the `cursor` CLI is on `PATH`:** you may use `cursor -n "$WORKTREE_PATH"` (or the documented flags for a new window) instead—only when verified available.

**Otherwise (Linux, Windows, missing app):** Do not claim success. Tell the user to use **File → New Window**, then **File → Open Folder…**, and choose `WORKTREE_PATH`.

This step is **best-effort**: report whether the open command ran and exited 0; the user can always open the folder manually.

---

## 14) Final reply to the user

Include:

| Field | Content |
|--------|--------|
| Base branch | `BASE_BRANCH` |
| Feature branch | `FEATURE_BRANCH` |
| Worktree path | `WORKTREE_PATH` |
| Summary | Short |
| Validation | Commands run |
| Prisma generate | OK or error |
| Commit | Hash if committed |
| PR | URL or “not created” + reason |
| Cursor | Opened worktree in new instance (command used) or manual open instructions |

---

## Rules

- Implement **only** inside the worktree after it exists; never edit the same files in `REPO_ROOT` for this feature.
- Do not remove the worktree unless the user asks.
- Follow repository conventions and agent rules for this project.
- Be explicit about failures; never fake success.
