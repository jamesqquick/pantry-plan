import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI (migrate dev) does not support Turso's libsql:// URL. The app
 * uses TURSO_DATABASE_URL at runtime via the libSQL adapter in lib/db.ts.
 * For creating migrations, use `npm run migrate:dev -- --name <name>` which
 * sets PRISMA_DATABASE_URL to a local SQLite file for the CLI only.
 * See: https://docs.prisma.io/docs/v6/orm/overview/databases/turso
 */
const databaseUrl =
  process.env.PRISMA_DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Set TURSO_DATABASE_URL (required for app and migrate deploy). For creating migrations, use: npm run migrate:dev -- --name <migration_name>"
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
