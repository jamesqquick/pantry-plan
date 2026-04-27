import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

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
  return drizzle(binding, { schema, casing: "camelCase" });
}

export type Db = ReturnType<typeof createDb>;

// Re-export schema for convenient imports: `import { user, recipe } from "@/db"`
export * from "./schema";
