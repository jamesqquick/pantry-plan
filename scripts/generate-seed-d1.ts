/**
 * Generates prisma/seed-d1.sql from the same data and logic as prisma/seed.ts.
 * Run: npx tsx scripts/generate-seed-d1.ts
 * Then apply to D1: npx wrangler d1 execute DB --remote --file=./prisma/seed-d1.sql
 */
import * as fs from "fs";
import * as path from "path";
import { hash } from "bcryptjs";
import { normalizeIngredientName } from "../lib/ingredients/normalize";
import { getDisplayTextFromIngredientLine } from "../lib/ingredients/parse-ingredient-line-structured";

const SEED_DATA_DIR = path.join(process.cwd(), "data", "seed");
const INGREDIENTS_JSON_PATH = path.join(SEED_DATA_DIR, "ingredients.json");
const CONFIDENCE_VALUES = ["High", "Medium", "Low"] as const;

const DEMO_EMAIL = "demo@bytheboysbakery.com";
const DEMO_PASSWORD = "demo-password-123";
const DEMO_NAME = "Demo User";

const ADMIN_EMAIL = "admin@bytheboysbakery.com";
const ADMIN_PASSWORD = "admin-password-123";
const ADMIN_NAME = "Admin User";

function seedId(prefix: string, index: number): string {
  return `seed_${prefix}_${String(index).padStart(3, "0")}`;
}

function sqlEsc(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlStr(s: string | null | undefined): string {
  if (s == null) return "NULL";
  return `'${sqlEsc(s)}'`;
}

function sqlNum(n: number | null | undefined): string {
  if (n == null) return "NULL";
  return String(n);
}

function getPreferredDisplayUnit(
  name: string,
  _category: string,
  subcategory: string
): "AUTO" | "GRAM" | "CUP" | "EACH" | "TBSP" | "TSP" {
  const n = name.toLowerCase();
  const sub = subcategory.toLowerCase();

  if (sub === "eggs") return "EACH";
  if (sub === "salt" || sub === "spice" || sub === "herb (dried)") return "TSP";
  if (sub === "baking add-in") {
    if (
      /extract|essence|soda|powder|yeast|gelatin/.test(n) ||
      n.includes("baking soda") ||
      n.includes("baking powder")
    )
      return "TSP";
    return "CUP";
  }
  if (sub === "oil" || sub === "vinegar") return "TBSP";
  if (sub === "chocolate") {
    if (n.includes("cocoa")) return "TBSP";
    return "CUP";
  }
  if (
    n.includes("butter") ||
    n.includes("peanut butter") ||
    n.includes("honey") ||
    n.includes("syrup") ||
    n.includes("molasses")
  )
    return "TBSP";
  if (
    sub === "flour" ||
    sub === "sugar" ||
    sub === "milk/cream" ||
    sub === "cheese" ||
    sub === "cultured" ||
    sub === "rice/grain (dry)" ||
    sub === "pasta (dry)" ||
    sub === "beans/legumes" ||
    sub === "fruit (chopped)" ||
    sub === "vegetable (chopped)" ||
    sub === "leafy green (raw)" ||
    sub === "canned tomato" ||
    sub === "broth/stock" ||
    sub === "baking" ||
    sub === "meat/fish (diced)" ||
    sub === "condiment/sauce"
  )
    return "CUP";
  return "AUTO";
}

const SEED_USER_ID = seedId("user", 1);
const SEED_ORDER_ID = seedId("order", 1);

const SEED_ALIASES: { aliasNormalized: string; targetNormalizedName: string }[] = [
  { aliasNormalized: "all-purpose flour", targetNormalizedName: "all purpose flour" },
  { aliasNormalized: "ap flour", targetNormalizedName: "all purpose flour" },
  { aliasNormalized: "confectioners sugar", targetNormalizedName: "powdered sugar" },
  { aliasNormalized: "icing sugar", targetNormalizedName: "powdered sugar" },
  { aliasNormalized: "granulated sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "white sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "caster sugar", targetNormalizedName: "superfine sugar" },
  { aliasNormalized: "bicarbonate of soda", targetNormalizedName: "baking soda" },
  { aliasNormalized: "bicarb soda", targetNormalizedName: "baking soda" },
  { aliasNormalized: "sea salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "table salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "vanilla", targetNormalizedName: "vanilla extract" },
  { aliasNormalized: "brown sugar", targetNormalizedName: "light brown sugar" },
  { aliasNormalized: "packed brown sugar", targetNormalizedName: "light brown sugar" },
  { aliasNormalized: "semi sweet choc chips", targetNormalizedName: "semi sweet chocolate chips" },
  { aliasNormalized: "chocolate chips", targetNormalizedName: "semi sweet chocolate chips" },
  { aliasNormalized: "cocoa", targetNormalizedName: "cocoa powder" },
  { aliasNormalized: "butter", targetNormalizedName: "butter" },
  { aliasNormalized: "salted butter", targetNormalizedName: "butter" },
  { aliasNormalized: "unsalted butter", targetNormalizedName: "butter" },
  { aliasNormalized: "milk", targetNormalizedName: "whole milk" },
  { aliasNormalized: "eggs", targetNormalizedName: "eggs" },
  { aliasNormalized: "egg", targetNormalizedName: "eggs" },
  { aliasNormalized: "large eggs", targetNormalizedName: "eggs" },
  { aliasNormalized: "old fashioned oats", targetNormalizedName: "rolled oats" },
];

async function main() {
  const demoPasswordHash = await hash(DEMO_PASSWORD, 10);
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 10);

  const now = "datetime('now')";
  const lines: string[] = [];

  // Users
  lines.push(
    `INSERT INTO "User" (id, email, passwordHash, name, role, createdAt, updatedAt) VALUES`,
    `('${SEED_USER_ID}', '${sqlEsc(DEMO_EMAIL)}', '${sqlEsc(demoPasswordHash)}', '${sqlEsc(DEMO_NAME)}', 'USER', ${now}, ${now});`,
    `INSERT INTO "User" (id, email, passwordHash, name, role, createdAt, updatedAt) VALUES`,
    `('${seedId("user", 2)}', '${sqlEsc(ADMIN_EMAIL)}', '${sqlEsc(adminPasswordHash)}', '${sqlEsc(ADMIN_NAME)}', 'ADMIN', ${now}, ${now});`
  );

  // Tags
  const tagNames = ["Dessert", "Quick", "Favourite", "Holiday", "Breakfast"];
  const tagIds: string[] = [];
  for (let t = 0; t < tagNames.length; t++) {
    const id = seedId("tag", t + 1);
    tagIds.push(id);
    lines.push(
      `INSERT INTO "Tag" (id, userId, name, createdAt) VALUES ('${id}', '${SEED_USER_ID}', '${sqlEsc(tagNames[t]!)}', ${now});`
    );
  }

  // Ingredients JSON -> categories, subcategories, ingredients
  const raw = JSON.parse(fs.readFileSync(INGREDIENTS_JSON_PATH, "utf-8"));
  if (!Array.isArray(raw)) throw new Error("data/seed/ingredients.json must be a top-level array");
  const items: Record<string, unknown>[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      for (const sub of item) {
        if (sub != null && typeof sub === "object" && !Array.isArray(sub)) items.push(sub as Record<string, unknown>);
      }
    } else if (item != null && typeof item === "object") {
      items.push(item as Record<string, unknown>);
    }
  }

  const categorySubcategoryPairs = new Set<string>();
  for (const row of items as Record<string, unknown>[]) {
    const cat = typeof row.category === "string" ? row.category.trim() : "";
    const sub = typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    if (cat && sub) categorySubcategoryPairs.add(`${cat}\n${sub}`);
  }
  const uniqueCategoryNames = [...new Set([...categorySubcategoryPairs].map((p) => p.split("\n")[0]!))].sort();
  const categoryIdByName: Record<string, string> = {};
  for (let c = 0; c < uniqueCategoryNames.length; c++) {
    const name = uniqueCategoryNames[c]!;
    const id = seedId("cat", c + 1);
    categoryIdByName[name] = id;
    lines.push(`INSERT INTO "IngredientCategory" (id, name) VALUES ('${id}', '${sqlEsc(name)}');`);
  }

  const pairsSorted = [...categorySubcategoryPairs]
    .map((p) => {
      const [cat, sub] = p.split("\n");
      return [cat!, sub!] as const;
    })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  for (let s = 0; s < pairsSorted.length; s++) {
    const [categoryName, subcategoryName] = pairsSorted[s]!;
    const id = seedId("subcat", s + 1);
    lines.push(
      `INSERT INTO "IngredientSubcategory" (id, name, ingredientCategoryId) VALUES ('${id}', '${sqlEsc(subcategoryName)}', '${categoryIdByName[categoryName]!}');`
    );
  }

  const normalizedSet = new Set<string>();
  type IngredientRow = {
    id: string;
    name: string;
    normalizedName: string;
    category: string | null;
    subcategory: string;
    costBasisUnit: string;
    preferredDisplayUnit: string;
    estimatedCentsPerBasisUnit: number | null;
    gramsPerCup: number | null;
    conversionConfidence: string;
    costConfidence: string;
    notes: string | null;
  };
  const ingredientRows: IngredientRow[] = [];
  let insertIndex = 0;
  for (let i = 0; i < items.length; i++) {
    const row = items[i] as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) throw new Error(`data/seed/ingredients.json[${i}]: name required`);
    const normalizedName = normalizeIngredientName(name);
    if (normalizedSet.has(normalizedName)) continue;
    normalizedSet.add(normalizedName);

    const category = typeof row.category === "string" ? row.category.trim() : "";
    const subcategory = typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    const gramsPerCupRaw = row.grams_per_cup;
    const costBasisUnitRaw = row.cost_basis_unit;
    const estimatedCentsRaw = row.estimated_cents_per_basis_unit;
    const costBasisUnit =
      costBasisUnitRaw === "GRAM" || costBasisUnitRaw === "CUP" || costBasisUnitRaw === "EACH"
        ? (costBasisUnitRaw as string)
        : "GRAM";
    const conversionConfidence = row.conversion_confidence as (typeof CONFIDENCE_VALUES)[number];
    const costConfidence = row.cost_confidence as (typeof CONFIDENCE_VALUES)[number];
    const notes = typeof row.notes === "string" ? row.notes : null;
    insertIndex += 1;
    ingredientRows.push({
      id: seedId("ing", insertIndex),
      name,
      normalizedName,
      category: category || null,
      subcategory: subcategory || "",
      costBasisUnit,
      preferredDisplayUnit: getPreferredDisplayUnit(name, category, subcategory),
      estimatedCentsPerBasisUnit:
        estimatedCentsRaw != null && typeof estimatedCentsRaw === "number" ? estimatedCentsRaw : null,
      gramsPerCup: gramsPerCupRaw != null && typeof gramsPerCupRaw === "number" ? gramsPerCupRaw : null,
      conversionConfidence: conversionConfidence ?? "Medium",
      costConfidence: costConfidence ?? "Medium",
      notes,
    });
  }

  for (const ing of ingredientRows) {
    lines.push(
      `INSERT INTO "Ingredient" (id, name, normalizedName, category, subcategory, costBasisUnit, estimatedCentsPerBasisUnit, gramsPerCup, conversionConfidence, costConfidence, preferredDisplayUnit, notes, createdAt, updatedAt) VALUES (` +
        `'${ing.id}', ${sqlStr(ing.name)}, ${sqlStr(ing.normalizedName)}, ${sqlStr(ing.category)}, ${sqlStr(ing.subcategory)}, ` +
        `'${ing.costBasisUnit}', ${sqlNum(ing.estimatedCentsPerBasisUnit)}, ${sqlNum(ing.gramsPerCup)}, ` +
        `${sqlStr(ing.conversionConfidence)}, ${sqlStr(ing.costConfidence)}, '${ing.preferredDisplayUnit}', ${sqlStr(ing.notes)}, ${now}, ${now});`
    );
  }

  const ingredientIdsByNormalizedName: Record<string, string> = {};
  for (const ing of ingredientRows) {
    ingredientIdsByNormalizedName[ing.normalizedName] = ing.id;
  }
  const fallbacks: [string, string][] = [
    ["eggs", "egg"],
    ["semi sweet chocolate chips", "chocolate chips"],
    ["flaky sea salt", "salt"],
    ["dark chocolate chips", "dark chocolate"],
    ["strong brewed coffee", "instant espresso powder"],
  ];
  for (const [target, canonical] of fallbacks) {
    if (!ingredientIdsByNormalizedName[target] && ingredientIdsByNormalizedName[canonical]) {
      ingredientIdsByNormalizedName[target] = ingredientIdsByNormalizedName[canonical]!;
    }
  }

  let aliasIndex = 0;
  for (const { aliasNormalized, targetNormalizedName } of SEED_ALIASES) {
    const ingredientId = ingredientIdsByNormalizedName[targetNormalizedName];
    if (!ingredientId) continue;
    const norm = normalizeIngredientName(aliasNormalized);
    aliasIndex += 1;
    lines.push(
      `INSERT INTO "IngredientAlias" (id, ingredientId, aliasNormalized, createdAt) VALUES ('${seedId("alias", aliasIndex)}', '${ingredientId}', '${sqlEsc(norm)}', ${now});`
    );
  }

  const getIngId = (normalizedName: string): string => {
    const id = ingredientIdsByNormalizedName[normalizedName];
    if (!id) throw new Error(`Missing ingredient: ${normalizedName}`);
    return id;
  };

  type RecipeSeed = {
    title: string;
    servings: number;
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    totalTimeMinutes: number;
    instructions: string[];
    ingredients: Array<{
      ingredientNormalizedName: string;
      quantity: number;
      unit: string;
      originalLine: string;
    }>;
    tagIndexes?: number[];
  };

  const recipesPath = path.join(SEED_DATA_DIR, "recipes.json");
  const recipesData = JSON.parse(fs.readFileSync(recipesPath, "utf-8")) as RecipeSeed[];
  if (!Array.isArray(recipesData)) throw new Error("data/seed/recipes.json must be a top-level array");

  const recipeIds: string[] = [];
  let riIndex = 0;
  let instrIndex = 0;
  let rtIndex = 0;

  for (let r = 0; r < recipesData.length; r++) {
    const rec = recipesData[r]!;
    const recipeId = seedId("recipe", r + 1);
    recipeIds.push(recipeId);

    lines.push(
      `INSERT INTO "Recipe" (id, userId, title, servings, prepTimeMinutes, cookTimeMinutes, totalTimeMinutes, createdAt, updatedAt) VALUES (` +
        `'${recipeId}', '${SEED_USER_ID}', ${sqlStr(rec.title)}, ${rec.servings}, ${rec.prepTimeMinutes}, ${rec.cookTimeMinutes}, ${rec.totalTimeMinutes}, ${now}, ${now});`
    );

    if (rec.instructions?.length) {
      for (let so = 0; so < rec.instructions.length; so++) {
        instrIndex += 1;
        const text = rec.instructions[so]!;
        lines.push(
          `INSERT INTO "RecipeInstruction" (id, recipeId, sortOrder, text) VALUES ('${seedId("instr", instrIndex)}', '${recipeId}', ${so}, ${sqlStr(text)});`
        );
      }
    }

    for (let i = 0; i < (rec.ingredients ?? []).length; i++) {
      const row = rec.ingredients[i]!;
      const ingredientId = getIngId(row.ingredientNormalizedName);
      riIndex += 1;
      const rawQty = row.originalLine.match(/^[\d\s./½¼¾⅓⅔⅛⅜⅝⅞]+/)?.[0]?.trim() ?? null;
      const displayText = getDisplayTextFromIngredientLine(row.originalLine);
      const unit = row.unit as string;
      lines.push(
        `INSERT INTO "RecipeIngredient" (id, recipeId, ingredientId, quantity, rawQuantityText, unit, displayText, rawText, sortOrder, originalQuantity, originalUnit, createdAt, updatedAt) VALUES (` +
          `'${seedId("ri", riIndex)}', '${recipeId}', '${ingredientId}', ${row.quantity}, ${sqlStr(rawQty)}, '${sqlEsc(unit)}', ${sqlStr(displayText)}, ${sqlStr(row.originalLine)}, ${i}, ${row.quantity}, '${sqlEsc(unit)}', ${now}, ${now});`
      );
    }

    const tagIndexes = rec.tagIndexes ?? [];
    for (const ti of tagIndexes) {
      if (tagIds[ti] != null) {
        rtIndex += 1;
        lines.push(
          `INSERT INTO "RecipeTag" (id, recipeId, tagId) VALUES ('${seedId("rt", rtIndex)}', '${recipeId}', '${tagIds[ti]!}');`
        );
      }
    }
  }

  type OrderItemSeed = { recipeIndex: number; batches: number };
  type OrderSeed = { name: string; notes?: string; items: OrderItemSeed[] };

  const ordersPath = path.join(SEED_DATA_DIR, "orders.json");
  const ordersData = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) as OrderSeed[];
  if (!Array.isArray(ordersData)) throw new Error("data/seed/orders.json must be a top-level array");

  let oiIndex = 0;
  for (let o = 0; o < ordersData.length; o++) {
    const ord = ordersData[o]!;
    const orderId = o === 0 ? SEED_ORDER_ID : seedId("order", o + 1);
    lines.push(
      `INSERT INTO "Order" (id, userId, name, notes, createdAt, updatedAt) VALUES (` +
        `'${orderId}', '${SEED_USER_ID}', ${sqlStr(ord.name ?? "Untitled order")}, ${sqlStr(ord.notes ?? null)}, ${now}, ${now});`
    );
    for (const item of ord.items ?? []) {
      oiIndex += 1;
      const recipeId = recipeIds[item.recipeIndex];
      if (!recipeId) throw new Error(`orders.json order ${o + 1}: invalid recipeIndex ${item.recipeIndex}`);
      const batches = Math.max(1, item.batches);
      lines.push(
        `INSERT INTO "OrderItem" (id, orderId, recipeId, batches, createdAt, updatedAt) VALUES (` +
          `'${seedId("oi", oiIndex)}', '${orderId}', '${recipeId}', ${batches}, ${now}, ${now});`
      );
    }
  }

  const outPath = path.join(process.cwd(), "prisma", "seed-d1.sql");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
