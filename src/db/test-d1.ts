import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createDb, type Db } from "./index";

const migrationsDirectory = new URL("./migrations/", import.meta.url);

/** Test-only, ephemeral workerd D1. Call dispose even when assertions fail. */
export async function createTestD1(
  beforeMigration?: (filename: string, db: Db) => Promise<void>,
): Promise<{ db: Db; binding: D1Database; dispose: () => Promise<void> }> {
  const runtime = new Miniflare({
    cf: false,
    telemetry: { enabled: false },
    workers: [{
      config: {
        name: "ingredient-tests",
        compatibilityDate: "2026-04-20",
        manifest: {
          mainModule: "test.js",
          modules: {
            "test.js": { type: "esm", contents: "export default { fetch() { return new Response(null, { status: 204 }); } };" },
          },
        },
        env: { DB: { type: "d1", id: crypto.randomUUID() } },
      },
    }],
  });
  try {
    const binding = await runtime.getD1Database("DB");
    const db = createDb(binding);
    const filenames = (await readdir(fileURLToPath(migrationsDirectory)))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    for (const filename of filenames) {
      await beforeMigration?.(filename, db);
      const migration = await readFile(new URL(filename, migrationsDirectory), "utf8");
      const statements = migration.split("--> statement-breakpoint")
        .filter((statement) => statement.trim())
        .map((statement) => binding.prepare(statement));
      await binding.batch(statements);
    }
    return { db, binding, dispose: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
