import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database } from "@cloudflare/workers-types";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const sqliteUrl =
  process.env.DATABASE_URL ?? "file:./prisma/dev.db";

/** Global client used in development (local SQLite) and as fallback when not on Cloudflare. */
const globalDb =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: sqliteUrl }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = globalDb;

/**
 * Returns a PrismaClient for the current context.
 * - Development: local SQLite (DATABASE_URL).
 * - Production on Cloudflare: D1 via env.DB binding (requires @opennextjs/cloudflare).
 * - Production elsewhere: local SQLite (DATABASE_URL) as fallback.
 * Cached per-request when on Cloudflare so the same client is reused.
 */
export const getDb = cache((): PrismaClient => {
  if (process.env.NODE_ENV === "development") {
    return globalDb;
  }
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env: { DB?: D1Database } };
    };
    const { env } = getCloudflareContext();
    if (env?.DB) {
      const adapter = new PrismaD1(env.DB);
      return new PrismaClient({ adapter });
    }
  } catch {
    // Not on Cloudflare or @opennextjs/cloudflare not available; use SQLite fallback.
  }
  return globalDb;
});

/**
 * @deprecated Use getDb() so production uses D1 on Cloudflare. Exported for backward compatibility.
 */
export const db = globalDb;
