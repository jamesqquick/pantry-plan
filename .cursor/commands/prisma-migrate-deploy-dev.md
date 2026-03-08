# Prisma migrate deploy (dev)

Help me apply existing Prisma migrations to the **dev** database (no new migration created).

1. **Context**: We use Prisma 7; the database URL comes from `TURSO_DATABASE_URL` in `.env` (via `prisma.config.ts`). Ensure we're targeting the dev database.
2. **Run**: Execute `npx prisma migrate deploy` to apply any pending migrations in `prisma/migrations/` to the dev DB.
3. **Confirm**: Report how many migrations were applied (if any) or that the database was already up to date.

Use this when pulling new migrations or syncing dev after schema changes were created elsewhere. Do not use for production; use the production deploy command instead.
