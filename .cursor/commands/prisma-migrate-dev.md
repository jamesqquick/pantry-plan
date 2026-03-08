# Prisma migrate dev (create new migration)

Help me create and apply a new Prisma migration against the **dev** database.

1. **Context**: We use Prisma 7; the database URL comes from `TURSO_DATABASE_URL` in `.env` (via `prisma.config.ts`). Ensure we're targeting the dev database.
2. **Migration name**: If I didn't provide one, suggest a short, descriptive name (e.g. `add_recipe_notes`, `add_user_avatar_url`). Use snake_case.
3. **Run**: Execute `npx prisma migrate dev --name <migration_name>` so the migration is created from the current schema and applied to the dev DB. Regenerate the client if needed.
4. **Confirm**: Summarize what migration was created and where (`prisma/migrations/<timestamp>_<name>/migration.sql`).

Only use this for the **dev** database. Do not run `migrate dev` against production.
