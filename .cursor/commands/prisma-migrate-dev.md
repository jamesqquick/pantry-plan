# Prisma migrate dev (create new migration)

Help me create a new Prisma migration. We use **Turso** (libSQL); Prisma CLI does not support `libsql://` for `migrate dev`, so we use a **script** that points the CLI at a local SQLite file. No extra env var is required.

1. **Context**: Prisma 7. The project uses `npm run migrate:dev` which sets `PRISMA_DATABASE_URL=file:./prisma/dev.db` for the duration of the command only. The app always uses `TURSO_DATABASE_URL` at runtime (lib/db.ts). Do not run `npx prisma migrate dev` directly—use the script so the CLI uses local SQLite.
2. **Migration name**: If I didn't provide one, suggest a short, descriptive name (e.g. `add_recipe_notes`, `add_user_avatar_url`). Use snake_case.
3. **Run**: Execute `npm run migrate:dev -- --name <migration_name>` (the `--` passes the flag to Prisma). This creates the migration and applies it to `prisma/dev.db`; migration files are written to `prisma/migrations/`.
4. **Confirm**: Summarize what migration was created and where (`prisma/migrations/<timestamp>_<name>/migration.sql`). Remind that to apply this migration to Turso dev, run: `turso db shell <your-db-name> < prisma/migrations/<timestamp>_<name>/migration.sql` (or use the deploy-dev command).

Only use this for creating migrations. Do not run `migrate dev` against production.
