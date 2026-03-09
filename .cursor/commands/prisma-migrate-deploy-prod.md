# Prisma migrate deploy (production)

Help me safely apply Prisma migrations to the **production** Turso database.

1. **Safety**: Remind me that production should have a backup (e.g. Turso backup/export) before applying, and that we should deploy the app version that matches these migrations.
2. **Context**: We use Turso; `npx prisma migrate deploy` does not work with Turso URLs. Apply migrations using the **Turso CLI** (`turso db shell`).
3. **Prod database name**: Use the Turso database name for production (e.g. from `turso db list` when env points at prod, or from `TURSO_PROD_DB_NAME` in `.env` if set). If running locally, remind me to load prod env or set the prod database name.
4. **Steps**:
   - List migration folders in `prisma/migrations/` (only directories whose names start with digits, e.g. `20260305192608_init`, `20260307120000_add_recipe_last_viewed_at`).
   - Determine which migrations have **not** yet been applied to production (e.g. by asking me, or by applying the most recent only if that’s the usual workflow). If unsure, apply the **latest** migration (sort by folder name, take the greatest).
   - For each pending migration, run: `turso db shell <prod-db-name> < prisma/migrations/<migration-folder>/migration.sql`
5. **Confirm**: Report that the migration(s) were applied or report any error. Remind that Prisma’s `_prisma_migrations` table is not updated by this; the schema change is applied to the prod DB.

If I'm in a local shell, give me the exact `turso db shell` command(s) and remind me to use the production Turso database name (and to take a backup first).
