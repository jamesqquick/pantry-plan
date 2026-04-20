/**
 * Snapshot the existing Turso (libSQL) database to local JSON files.
 *
 * Usage:
 *   npm run snapshot:turso
 *
 * `tsx --env-file=../.env` loads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
 * from the repo root .env. Writes one JSON file per Prisma table to
 * data/turso-snapshot/<TableName>.json plus a manifest.json with row
 * counts and a timestamp.
 *
 * This is a read-only operation. It never writes to Turso.
 *
 * The output is intended to be committed to git so that Phase 2.5
 * (data migration into D1) can run from a stable, local source without
 * needing live Turso credentials.
 */
import { createClient } from "@libsql/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "data", "turso-snapshot");

// Order matters only for readability — snapshotting is just reads.
// These match the Prisma @@map / table names exactly (Prisma uses the model
// name by default, so these are just the model names).
const TABLES = [
  "User",
  "IngredientCategory",
  "IngredientSubcategory",
  "Ingredient",
  "IngredientAlias",
  "Tag",
  "Recipe",
  "RecipeInstruction",
  "RecipeIngredient",
  "RecipeTag",
  "Order",
  "OrderItem",
  "PlannedMeal",
] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[snapshot] Missing required env var: ${name}`);
    console.error(`[snapshot] Add it to .env at the repo root.`);
    process.exit(1);
  }
  return v;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function main() {
  const url = requireEnv("TURSO_DATABASE_URL");
  const authToken = requireEnv("TURSO_AUTH_TOKEN");

  console.log(
    `[snapshot] Connecting to ${url.replace(/\/\/.*@/, "//<redacted>@")}...`
  );
  const client = createClient({ url, authToken });

  await mkdir(OUTPUT_DIR, { recursive: true });

  const manifest: Record<string, { rows: number; columns: string[] }> = {};
  let totalRows = 0;

  for (const table of TABLES) {
    // libsql needs the identifier quoted because `Order` and `User` are reserved words.
    const stmt = `SELECT * FROM "${table}"`;
    const result = await client.execute(stmt);

    const rows = result.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of result.columns) {
        out[col] = row[col];
      }
      return out;
    });

    const columns = [...result.columns];
    manifest[table] = { rows: rows.length, columns };
    totalRows += rows.length;

    const outPath = join(OUTPUT_DIR, `${table}.json`);
    await writeFile(outPath, JSON.stringify(rows, bigintReplacer, 2) + "\n");

    console.log(
      `[snapshot] ${table.padEnd(22)} ${String(rows.length).padStart(6)} rows  (${columns.length} cols)`
    );
  }

  const manifestPath = join(OUTPUT_DIR, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        snapshotAt: new Date().toISOString(),
        source: "turso",
        totalRows,
        tables: manifest,
      },
      bigintReplacer,
      2
    ) + "\n"
  );

  console.log(`[snapshot] ---`);
  console.log(`[snapshot] ${totalRows} total rows written to ${OUTPUT_DIR}`);
  console.log(`[snapshot] Manifest: ${manifestPath}`);

  client.close();
}

main().catch((err) => {
  console.error("[snapshot] Failed:", err);
  process.exit(1);
});
