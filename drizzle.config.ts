import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for D1.
 *
 * Commands:
 *   npm run db:generate   # generate SQL migrations from schema changes
 *   npm run db:migrate    # apply migrations locally (--local) or remotely (--remote)
 *   npm run db:studio     # open drizzle studio (uses driver below)
 *
 * We use the `d1-http` driver for studio access in dev; migrations themselves
 * are applied via `wrangler d1 migrations apply` which reads raw .sql files.
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  casing: "camelCase",
  // HTTP driver credentials are only required for `drizzle-kit studio`/`push`.
  // They are read from env so CI/local can set them without committing secrets.
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
