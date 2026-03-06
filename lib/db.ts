import { PrismaClient } from "@/generated/prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database } from "@cloudflare/workers-types";
import { cache } from "react";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Lazily create a SQLite-backed client (requires native better-sqlite3 addon). */
function createSqliteClient(): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSQLite3 } = require("@prisma/adapter-better-sqlite3");
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  return new PrismaClient({
    adapter: new PrismaBetterSQLite3({ url }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getSqliteClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createSqliteClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Returns a PrismaClient for the current context.
 * - Development: local SQLite (DATABASE_URL).
 * - Cloudflare (local preview or production): D1 via env.DB binding.
 * - Fallback: local SQLite (DATABASE_URL).
 * Cached per-request so the same client is reused.
 */
export const getDb = cache((): PrismaClient => {
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
  return getSqliteClient();
});

