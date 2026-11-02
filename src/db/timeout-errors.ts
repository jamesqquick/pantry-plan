import type { TablesRelationalConfig } from "drizzle-orm";
import type { SQLiteD1Session } from "drizzle-orm/d1";
import { DatabaseTimeoutError } from "@/lib/database-timeout";

function timeoutCause(error: unknown): DatabaseTimeoutError | undefined {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    if (error instanceof DatabaseTimeoutError) return error;
    seen.add(error);
    error = error.cause;
  }
  return undefined;
}

export function redactDatabaseTimeouts<T extends object>(database: T): T {
  // Drizzle has no error-transform option. Its per-client session is the shared
  // boundary for fluent, relational, and prepared queries in the installed driver.
  const session = Reflect.get(database, "session") as SQLiteD1Session<Record<string, unknown>, TablesRelationalConfig>;
  const prepareQuery = session.prepareQuery.bind(session);
  session.prepareQuery = (...args) => new Proxy(prepareQuery(...args), {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!["all", "get", "run", "values", "execute"].includes(String(key))) return value.bind(target);
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } catch (error) {
          // Discard SQL, bound parameters, and the wrapper's stack before logging.
          throw timeoutCause(error) ?? error;
        }
      };
    },
  });
  return database;
}
