/**
 * In-memory D1 stand-in for tests, backed by Node's built-in `node:sqlite`.
 * Applies the real migrations so Drizzle queries and raw SQL run against the
 * same schema as production.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createDb, type Db } from "@/db";

const MIGRATIONS_DIR = path.resolve(__dirname, "../db/migrations");

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return value as SQLInputValue;
}

class FakeD1Statement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeD1Statement(this.sqlite, this.query, params);
  }

  private values() {
    return this.params.map(toSqlValue);
  }

  async all() {
    const results = this.sqlite.prepare(this.query).all(...this.values());
    return { results, success: true, meta: {} };
  }

  async first(column?: string) {
    const row = this.sqlite.prepare(this.query).get(...this.values()) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return column ? row[column] : row;
  }

  async run() {
    const result = this.sqlite.prepare(this.query).run(...this.values());
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async raw() {
    const stmt = this.sqlite.prepare(this.query);
    stmt.setReturnArrays(true);
    return stmt.all(...this.values());
  }
}

class FakeD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(query: string) {
    return new FakeD1Statement(this.sqlite, query);
  }

  async batch(statements: FakeD1Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string) {
    this.sqlite.exec(query);
    return { count: 0, duration: 0 };
  }
}

export function createTestDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const migration = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  const db = createDb(new FakeD1Database(sqlite) as unknown as D1Database);
  return { db, sqlite };
}
