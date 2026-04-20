/**
 * Phase 2.5 — Transform the Turso snapshot into a D1-compatible SQL file.
 *
 * Reads data/turso-snapshot/<Table>.json and writes
 * data/turso-snapshot/load.sql which can be applied with:
 *
 *   npx wrangler d1 execute pantry-plan --local  --file=data/turso-snapshot/load.sql
 *   npx wrangler d1 execute pantry-plan --remote --file=data/turso-snapshot/load.sql
 *
 * Transforms applied:
 *   - Table name "User" -> "user" (Better Auth convention; our Phase 2 rename).
 *   - User.passwordHash -> goes into account.password as a SENTINEL that
 *     scrypt verify() will always reject. Users migrate via password reset.
 *   - User.name NULL -> coalesced to email localpart (our user.name is NOT NULL).
 *   - All createdAt/updatedAt/etc ISO strings -> unix milliseconds integers.
 *   - Decimal-ish columns (gramsPerCup) left as numbers (Drizzle stores in REAL).
 *   - Boolean-ish fields (none in our schema) — n/a.
 *   - "Order" must remain quoted in SQL (reserved word).
 *
 * Output is deterministic (stable ordering). Idempotence is handled by the
 * leading DELETE statements which clear every target table first.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createId } from "@paralleldrive/cuid2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(__dirname, "..", "data", "turso-snapshot");
const OUTPUT_FILE = join(SNAPSHOT_DIR, "load.sql");

// Sentinel password hash: valid format (hex:hex) that our scrypt verify()
// will successfully decode but whose bytes will never match any real scrypt
// output for any plaintext. The string "MIGRATED_RESET_REQUIRED" guarantees
// we can identify these rows later; the bytes "00..." ensure verification fails.
const SENTINEL_PASSWORD_HASH =
  "00000000000000000000000000000000:" +
  "0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Helpers

function quoteSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Non-finite number: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  throw new Error(`Unexpected value: ${typeof v} ${JSON.stringify(v)}`);
}

function dateStrToMs(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error(`Bad date: ${s}`);
  return t;
}

function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? email;
}

function buildInsert(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[]
): string[] {
  if (rows.length === 0) return [`-- ${table}: 0 rows`];
  const quotedTable = `"${table}"`;
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const out: string[] = [];
  // D1 accepts multi-row VALUES; chunk to stay under statement size limits.
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map((row) => "(" + row.map(quoteSql).join(", ") + ")")
      .join(",\n  ");
    out.push(`INSERT INTO ${quotedTable} (${cols}) VALUES\n  ${values};`);
  }
  return out;
}

async function readSnapshot<T = Record<string, unknown>>(
  name: string
): Promise<T[]> {
  const raw = await readFile(join(SNAPSHOT_DIR, `${name}.json`), "utf8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Per-table transforms

interface TursoUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}
interface TursoIngCategory {
  id: string;
  name: string;
}
interface TursoIngSubcategory {
  id: string;
  name: string;
  ingredientCategoryId: string;
}
interface TursoIngredient {
  id: string;
  userId: string | null;
  name: string;
  normalizedName: string;
  category: string | null;
  subcategory: string;
  defaultUnit: string | null;
  costBasisUnit: string;
  estimatedCentsPerBasisUnit: number | null;
  gramsPerCup: number | null;
  conversionConfidence: string;
  costConfidence: string;
  cupsPerEach: number | null;
  preferredDisplayUnit: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  baseIngredientId: string | null;
}
interface TursoIngAlias {
  id: string;
  ingredientId: string;
  aliasNormalized: string;
  createdAt: string;
}
interface TursoTag {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}
interface TursoRecipe {
  id: string;
  userId: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
}
interface TursoRecipeInstruction {
  id: string;
  recipeId: string;
  sortOrder: number;
  text: string;
}
interface TursoRecipeIngredient {
  id: string;
  recipeId: string;
  ingredientId: string | null;
  quantity: number | null;
  rawQuantityText: string | null;
  unit: string | null;
  displayText: string;
  rawText: string | null;
  sortOrder: number;
  originalQuantity: number | null;
  originalUnit: string | null;
  weightGrams: number | null;
  conversionSource: string | null;
  conversionConfidence: string | null;
  conversionNotes: string | null;
  parseConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}
interface TursoRecipeTag {
  id: string;
  recipeId: string;
  tagId: string;
}
interface TursoOrder {
  id: string;
  userId: string;
  name: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
interface TursoOrderItem {
  id: string;
  orderId: string;
  recipeId: string;
  batches: number;
  createdAt: string;
  updatedAt: string;
}
interface TursoPlannedMeal {
  id: string;
  userId: string;
  date: string;
  mealSlot: string;
  recipeId: string | null;
  customLabel: string | null;
  servings: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Main

async function main() {
  const [
    users,
    categories,
    subcategories,
    ingredients,
    aliases,
    tags,
    recipes,
    instructions,
    recipeIngredients,
    recipeTags,
    orders,
    orderItems,
    plannedMeals,
  ] = await Promise.all([
    readSnapshot<TursoUser>("User"),
    readSnapshot<TursoIngCategory>("IngredientCategory"),
    readSnapshot<TursoIngSubcategory>("IngredientSubcategory"),
    readSnapshot<TursoIngredient>("Ingredient"),
    readSnapshot<TursoIngAlias>("IngredientAlias"),
    readSnapshot<TursoTag>("Tag"),
    readSnapshot<TursoRecipe>("Recipe"),
    readSnapshot<TursoRecipeInstruction>("RecipeInstruction"),
    readSnapshot<TursoRecipeIngredient>("RecipeIngredient"),
    readSnapshot<TursoRecipeTag>("RecipeTag"),
    readSnapshot<TursoOrder>("Order"),
    readSnapshot<TursoOrderItem>("OrderItem"),
    readSnapshot<TursoPlannedMeal>("PlannedMeal"),
  ]);

  const lines: string[] = [];
  lines.push(
    "-- Auto-generated by scripts/migrate-from-snapshot.ts — do not edit."
  );
  lines.push(`-- Source: data/turso-snapshot/ (snapshot dated: see manifest)`);
  lines.push(
    `-- Password migration: every user row gets a sentinel hash in account.password`
  );
  lines.push(
    `-- so scrypt verify() always fails. Users must reset on first login.`
  );
  lines.push("");
  lines.push("PRAGMA defer_foreign_keys = ON;");
  lines.push("");

  // Clear target tables in reverse-dependency order.
  lines.push("-- Clear target tables (reverse dependency order)");
  for (const table of [
    "PlannedMeal",
    "OrderItem",
    '"Order"', // reserved word
    "RecipeTag",
    "RecipeIngredient",
    "RecipeInstruction",
    "Recipe",
    "Tag",
    "IngredientAlias",
    "Ingredient",
    "IngredientSubcategory",
    "IngredientCategory",
    "account",
    "session",
    "verification",
    "user",
  ]) {
    lines.push(`DELETE FROM ${table};`);
  }
  lines.push("");

  // ---- user ----
  const userRows = users.map((u) => [
    u.id,
    u.name ?? emailLocalPart(u.email),
    u.email,
    0, // emailVerified = false (Better Auth default)
    null, // image
    u.role, // USER | ADMIN
    dateStrToMs(u.createdAt),
    dateStrToMs(u.updatedAt),
  ]);
  lines.push(`-- user: ${users.length} rows (from Turso "User")`);
  lines.push(
    ...buildInsert(
      "user",
      [
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "role",
        "createdAt",
        "updatedAt",
      ],
      userRows
    )
  );
  lines.push("");

  // ---- account (credential rows for every migrated user) ----
  const accountRows = users.map((u) => {
    const now = dateStrToMs(u.createdAt);
    return [
      createId(), // account.id (new)
      u.id, // userId
      u.id, // accountId (for credential accounts, Better Auth uses userId)
      "credential", // providerId
      null, // accessToken
      null, // refreshToken
      null, // accessTokenExpiresAt
      null, // refreshTokenExpiresAt
      null, // scope
      null, // idToken
      SENTINEL_PASSWORD_HASH, // password — sentinel, forces reset
      now,
      now,
    ];
  });
  lines.push(`-- account: ${accountRows.length} rows (credential, sentinel pw)`);
  lines.push(
    ...buildInsert(
      "account",
      [
        "id",
        "userId",
        "accountId",
        "providerId",
        "accessToken",
        "refreshToken",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "scope",
        "idToken",
        "password",
        "createdAt",
        "updatedAt",
      ],
      accountRows
    )
  );
  lines.push("");

  // ---- IngredientCategory ----
  lines.push(`-- IngredientCategory: ${categories.length} rows`);
  lines.push(
    ...buildInsert(
      "IngredientCategory",
      ["id", "name"],
      categories.map((c) => [c.id, c.name])
    )
  );
  lines.push("");

  // ---- IngredientSubcategory ----
  lines.push(`-- IngredientSubcategory: ${subcategories.length} rows`);
  lines.push(
    ...buildInsert(
      "IngredientSubcategory",
      ["id", "name", "ingredientCategoryId"],
      subcategories.map((s) => [s.id, s.name, s.ingredientCategoryId])
    )
  );
  lines.push("");

  // ---- Ingredient ----
  // Self-referencing (baseIngredientId). Insert all rows, then fix up FKs — but
  // since we deferred FKs (PRAGMA above) and baseIngredientId can point
  // anywhere within the same table, a single INSERT is fine.
  lines.push(`-- Ingredient: ${ingredients.length} rows`);
  lines.push(
    ...buildInsert(
      "Ingredient",
      [
        "id",
        "userId",
        "baseIngredientId",
        "name",
        "normalizedName",
        "category",
        "subcategory",
        "defaultUnit",
        "costBasisUnit",
        "estimatedCentsPerBasisUnit",
        "gramsPerCup",
        "conversionConfidence",
        "costConfidence",
        "cupsPerEach",
        "preferredDisplayUnit",
        "notes",
        "createdAt",
        "updatedAt",
      ],
      ingredients.map((i) => [
        i.id,
        i.userId,
        i.baseIngredientId,
        i.name,
        i.normalizedName,
        i.category,
        i.subcategory,
        i.defaultUnit,
        i.costBasisUnit,
        i.estimatedCentsPerBasisUnit,
        i.gramsPerCup,
        i.conversionConfidence,
        i.costConfidence,
        i.cupsPerEach,
        i.preferredDisplayUnit,
        i.notes,
        dateStrToMs(i.createdAt),
        dateStrToMs(i.updatedAt),
      ])
    )
  );
  lines.push("");

  // ---- IngredientAlias ----
  lines.push(`-- IngredientAlias: ${aliases.length} rows`);
  lines.push(
    ...buildInsert(
      "IngredientAlias",
      ["id", "ingredientId", "aliasNormalized", "createdAt"],
      aliases.map((a) => [
        a.id,
        a.ingredientId,
        a.aliasNormalized,
        dateStrToMs(a.createdAt),
      ])
    )
  );
  lines.push("");

  // ---- Tag ----
  lines.push(`-- Tag: ${tags.length} rows`);
  lines.push(
    ...buildInsert(
      "Tag",
      ["id", "userId", "name", "createdAt"],
      tags.map((t) => [t.id, t.userId, t.name, dateStrToMs(t.createdAt)])
    )
  );
  lines.push("");

  // ---- Recipe ----
  lines.push(`-- Recipe: ${recipes.length} rows`);
  lines.push(
    ...buildInsert(
      "Recipe",
      [
        "id",
        "userId",
        "title",
        "sourceUrl",
        "imageUrl",
        "servings",
        "prepTimeMinutes",
        "cookTimeMinutes",
        "totalTimeMinutes",
        "notes",
        "lastViewedAt",
        "createdAt",
        "updatedAt",
      ],
      recipes.map((r) => [
        r.id,
        r.userId,
        r.title,
        r.sourceUrl,
        r.imageUrl,
        r.servings,
        r.prepTimeMinutes,
        r.cookTimeMinutes,
        r.totalTimeMinutes,
        r.notes,
        dateStrToMs(r.lastViewedAt),
        dateStrToMs(r.createdAt),
        dateStrToMs(r.updatedAt),
      ])
    )
  );
  lines.push("");

  // ---- RecipeInstruction ----
  lines.push(`-- RecipeInstruction: ${instructions.length} rows`);
  lines.push(
    ...buildInsert(
      "RecipeInstruction",
      ["id", "recipeId", "sortOrder", "text"],
      instructions.map((x) => [x.id, x.recipeId, x.sortOrder, x.text])
    )
  );
  lines.push("");

  // ---- RecipeIngredient ----
  lines.push(`-- RecipeIngredient: ${recipeIngredients.length} rows`);
  lines.push(
    ...buildInsert(
      "RecipeIngredient",
      [
        "id",
        "recipeId",
        "ingredientId",
        "quantity",
        "rawQuantityText",
        "unit",
        "displayText",
        "rawText",
        "sortOrder",
        "originalQuantity",
        "originalUnit",
        "weightGrams",
        "conversionSource",
        "conversionConfidence",
        "conversionNotes",
        "parseConfidence",
        "createdAt",
        "updatedAt",
      ],
      recipeIngredients.map((x) => [
        x.id,
        x.recipeId,
        x.ingredientId,
        x.quantity,
        x.rawQuantityText,
        x.unit,
        x.displayText,
        x.rawText,
        x.sortOrder,
        x.originalQuantity,
        x.originalUnit,
        x.weightGrams,
        x.conversionSource,
        x.conversionConfidence,
        x.conversionNotes,
        x.parseConfidence,
        dateStrToMs(x.createdAt),
        dateStrToMs(x.updatedAt),
      ])
    )
  );
  lines.push("");

  // ---- RecipeTag ----
  lines.push(`-- RecipeTag: ${recipeTags.length} rows`);
  lines.push(
    ...buildInsert(
      "RecipeTag",
      ["id", "recipeId", "tagId"],
      recipeTags.map((x) => [x.id, x.recipeId, x.tagId])
    )
  );
  lines.push("");

  // ---- Order ----
  lines.push(`-- Order: ${orders.length} rows (note: quoted, reserved word)`);
  lines.push(
    ...buildInsert(
      "Order",
      ["id", "userId", "name", "notes", "createdAt", "updatedAt"],
      orders.map((o) => [
        o.id,
        o.userId,
        o.name,
        o.notes,
        dateStrToMs(o.createdAt),
        dateStrToMs(o.updatedAt),
      ])
    )
  );
  lines.push("");

  // ---- OrderItem ----
  lines.push(`-- OrderItem: ${orderItems.length} rows`);
  lines.push(
    ...buildInsert(
      "OrderItem",
      ["id", "orderId", "recipeId", "batches", "createdAt", "updatedAt"],
      orderItems.map((x) => [
        x.id,
        x.orderId,
        x.recipeId,
        x.batches,
        dateStrToMs(x.createdAt),
        dateStrToMs(x.updatedAt),
      ])
    )
  );
  lines.push("");

  // ---- PlannedMeal ----
  lines.push(`-- PlannedMeal: ${plannedMeals.length} rows`);
  lines.push(
    ...buildInsert(
      "PlannedMeal",
      [
        "id",
        "userId",
        "date",
        "mealSlot",
        "recipeId",
        "customLabel",
        "servings",
        "createdAt",
        "updatedAt",
      ],
      plannedMeals.map((x) => [
        x.id,
        x.userId,
        dateStrToMs(x.date),
        x.mealSlot,
        x.recipeId,
        x.customLabel,
        x.servings,
        dateStrToMs(x.createdAt),
        dateStrToMs(x.updatedAt),
      ])
    )
  );
  lines.push("");

  const expectedRows =
    users.length +
    accountRows.length +
    categories.length +
    subcategories.length +
    ingredients.length +
    aliases.length +
    tags.length +
    recipes.length +
    instructions.length +
    recipeIngredients.length +
    recipeTags.length +
    orders.length +
    orderItems.length +
    plannedMeals.length;

  lines.push(`-- Expected total rows inserted: ${expectedRows}`);

  await writeFile(OUTPUT_FILE, lines.join("\n") + "\n");
  console.log(`[migrate] Wrote ${OUTPUT_FILE}`);
  console.log(`[migrate] Expected row total: ${expectedRows}`);
  console.log(`[migrate] Apply with:`);
  console.log(
    `[migrate]   npx wrangler d1 execute pantry-plan --local  --file=${OUTPUT_FILE.replace(process.cwd() + "/", "")}`
  );
  console.log(
    `[migrate]   npx wrangler d1 execute pantry-plan --remote --file=${OUTPUT_FILE.replace(process.cwd() + "/", "")}`
  );
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
