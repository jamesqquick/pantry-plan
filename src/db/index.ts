import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getDatabaseBudget } from "@/lib/database-timeout";
import { withD1Deadline } from "./deadline-binding";
import { redactDatabaseTimeouts } from "./timeout-errors";

/**
 * Build a Drizzle client from a D1 binding.
 *
 * Usage inside Astro pages/actions:
 *   import { env } from "cloudflare:workers";
 *   import { createDb } from "@/db";
 *   const db = createDb(env.DB);
 *   const users = await db.select().from(user);
 *
 * We pass the full schema so relational query helpers (db.query.user.findFirst, etc.)
 * work without extra wiring.
 */
export function createDb(binding: D1Database) {
  const budget = getDatabaseBudget();
  const db = drizzle(budget ? withD1Deadline(binding, budget) : binding, { schema, casing: "camelCase" });
  return budget ? redactDatabaseTimeouts(db) : db;
}

export type Db = ReturnType<typeof createDb>;

// Re-export schema for convenient imports: `import { user, recipe } from "@/db"`
export * from "./schema";
