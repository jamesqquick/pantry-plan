# Prisma migrate deploy (dev)

Help me apply Prisma migrations to the **dev** Turso database (no new migration created).

1. **Context**: We use Turso; `npx prisma migrate deploy` does not work with Turso URLs. Apply migrations using the **Turso CLI** (`turso db shell`).
2. **Dev database name**: Use the Turso database name for dev (e.g. from `turso db list` when env points at dev, or from `TURSO_DEV_DB_NAME` or the database name in `TURSO_DATABASE_URL` in `.env` if set). If running locally, remind me to load dev env or set the dev database name.
3. **Steps**:
   - List migration folders in `prisma/migrations/` (only directories whose names start with digits, e.g. `20260305192608_init`, `20260307120000_add_recipe_last_viewed_at`).
   - Determine which migrations have **not** yet been applied to dev (e.g. by asking me, or by applying the most recent only if that's the usual workflow). If unsure, apply the **latest** migration (sort by folder name, take the greatest).
   - For each pending migration, run: `turso db shell <dev-db-name> < prisma/migrations/<migration-folder>/migration.sql`
4. **Confirm**: Report that the migration(s) were applied or report any error. Remind that Prisma's `_prisma_migrations` table is not updated by this; the schema change is applied to the dev DB.

Use this when pulling new migrations or syncing dev after schema changes were created elsewhere. Do not use for production; use the production deploy command instead.

If I'm in a local shell, give me the exact `turso db shell` command(s) and remind me to use the dev Turso database name.
