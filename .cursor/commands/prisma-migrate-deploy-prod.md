# Prisma migrate deploy (production)

Help me safely apply Prisma migrations to the **production** database.

1. **Safety**: Remind me that production should have a backup (e.g. Turso backup/export) before applying, and that we should deploy the app version that matches these migrations.
2. **Context**: We use Prisma 7; the database URL comes from `TURSO_DATABASE_URL`. For production, this must be the **production** Turso URL (set in the environment where the command runs—e.g. CI or a one-off shell with prod env).
3. **Run**: Execute `npx prisma migrate deploy` so that all pending migrations in `prisma/migrations/` are applied to the production DB. Do **not** use `prisma migrate dev` in production.
4. **Confirm**: Report how many migrations were applied and that the production database is up to date.

If I'm in a local shell, give me the exact command and remind me to set `TURSO_DATABASE_URL` to the production URL before running.
