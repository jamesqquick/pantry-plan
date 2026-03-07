import "dotenv/config";
import { Prisma } from "@/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";
import { hash } from "bcryptjs";
import { getDb } from "../lib/db";
import { normalizeIngredientName } from "../lib/ingredients/normalize";
import { getDisplayTextFromIngredientLine } from "../lib/ingredients/parse-ingredient-line-structured";

console.log("[seed] Using Turso (TURSO_DATABASE_URL=%s, TURSO_AUTH_TOKEN=%s)", process.env.TURSO_DATABASE_URL ? "set" : "not set", process.env.TURSO_AUTH_TOKEN ? "set" : "not set");

const prisma = getDb();

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

function getPreferredDisplayUnit(
  name: string,
  _category: string,
  subcategory: string,
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

const SEED_ALIASES: {
  aliasNormalized: string;
  targetNormalizedName: string;
}[] = [
  {
    aliasNormalized: "all-purpose flour",
    targetNormalizedName: "all purpose flour",
  },
  { aliasNormalized: "ap flour", targetNormalizedName: "all purpose flour" },
  {
    aliasNormalized: "confectioners sugar",
    targetNormalizedName: "powdered sugar",
  },
  { aliasNormalized: "icing sugar", targetNormalizedName: "powdered sugar" },
  { aliasNormalized: "granulated sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "white sugar", targetNormalizedName: "sugar" },
  { aliasNormalized: "caster sugar", targetNormalizedName: "superfine sugar" },
  {
    aliasNormalized: "bicarbonate of soda",
    targetNormalizedName: "baking soda",
  },
  { aliasNormalized: "bicarb soda", targetNormalizedName: "baking soda" },
  { aliasNormalized: "sea salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "table salt", targetNormalizedName: "fine sea salt" },
  { aliasNormalized: "vanilla", targetNormalizedName: "vanilla extract" },
  { aliasNormalized: "brown sugar", targetNormalizedName: "light brown sugar" },
  {
    aliasNormalized: "packed brown sugar",
    targetNormalizedName: "light brown sugar",
  },
  {
    aliasNormalized: "semi sweet choc chips",
    targetNormalizedName: "semi sweet chocolate chips",
  },
  {
    aliasNormalized: "chocolate chips",
    targetNormalizedName: "semi sweet chocolate chips",
  },
  { aliasNormalized: "cocoa", targetNormalizedName: "cocoa powder" },
  { aliasNormalized: "butter", targetNormalizedName: "butter" },
  { aliasNormalized: "salted butter", targetNormalizedName: "butter" },
  { aliasNormalized: "unsalted butter", targetNormalizedName: "butter" },
  { aliasNormalized: "milk", targetNormalizedName: "whole milk" },
  { aliasNormalized: "eggs", targetNormalizedName: "eggs" },
  { aliasNormalized: "egg", targetNormalizedName: "eggs" },
  { aliasNormalized: "large eggs", targetNormalizedName: "eggs" },
  {
    aliasNormalized: "old fashioned oats",
    targetNormalizedName: "rolled oats",
  },
];

async function main() {
  await prisma.$transaction([
    prisma.orderItem.deleteMany({}),
    prisma.order.deleteMany({}),
    prisma.recipeInstruction.deleteMany({}),
    prisma.recipeIngredient.deleteMany({}),
    prisma.recipeTag.deleteMany({}),
    prisma.recipe.deleteMany({}),
    prisma.ingredient.deleteMany({}),
    prisma.ingredientSubcategory.deleteMany({}),
    prisma.ingredientCategory.deleteMany({}),
    prisma.tag.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);

  const demoPasswordHash = await hash(DEMO_PASSWORD, 10);
  const adminPasswordHash = await hash(ADMIN_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      id: SEED_USER_ID,
      email: DEMO_EMAIL,
      passwordHash: demoPasswordHash,
      name: DEMO_NAME,
      role: "USER",
    },
  });
  await prisma.user.create({
    data: {
      id: seedId("user", 2),
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      name: ADMIN_NAME,
      role: "ADMIN",
    },
  });
  console.log(
    "Created demo user:",
    user.email,
    "(USER); admin user:",
    ADMIN_EMAIL,
    "(ADMIN).",
  );

  const tagNames = ["Dessert", "Quick", "Favourite", "Holiday", "Breakfast"];
  const tagIds: string[] = [];
  for (let t = 0; t < tagNames.length; t++) {
    const tag = await prisma.tag.create({
      data: {
        id: seedId("tag", t + 1),
        userId: user.id,
        name: tagNames[t]!,
      },
    });
    tagIds.push(tag.id);
  }
  console.log("Seeded", tagIds.length, "tags for demo user.");

  const raw = JSON.parse(fs.readFileSync(INGREDIENTS_JSON_PATH, "utf-8"));
  if (!Array.isArray(raw)) {
    throw new Error("data/seed/ingredients.json must be a top-level array");
  }
  const items: Record<string, unknown>[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      for (const sub of item) {
        if (sub != null && typeof sub === "object" && !Array.isArray(sub)) {
          items.push(sub as Record<string, unknown>);
        }
      }
    } else if (item != null && typeof item === "object") {
      items.push(item as Record<string, unknown>);
    }
  }

  const categorySubcategoryPairs = new Set<string>();
  for (const row of items as Record<string, unknown>[]) {
    const cat = typeof row.category === "string" ? row.category.trim() : "";
    const sub =
      typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    if (cat && sub) categorySubcategoryPairs.add(`${cat}\n${sub}`);
  }
  const uniqueCategoryNames = [
    ...new Set([...categorySubcategoryPairs].map((p) => p.split("\n")[0]!)),
  ].sort();
  const categoryIdByName: Record<string, string> = {};
  for (let c = 0; c < uniqueCategoryNames.length; c++) {
    const name = uniqueCategoryNames[c]!;
    const cat = await prisma.ingredientCategory.create({
      data: { id: seedId("cat", c + 1), name },
    });
    categoryIdByName[name] = cat.id;
  }
  const pairsSorted = [...categorySubcategoryPairs]
    .map((p) => {
      const [cat, sub] = p.split("\n");
      return [cat!, sub!] as const;
    })
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  for (let s = 0; s < pairsSorted.length; s++) {
    const [categoryName, subcategoryName] = pairsSorted[s]!;
    await prisma.ingredientSubcategory.create({
      data: {
        id: seedId("subcat", s + 1),
        name: subcategoryName,
        ingredientCategoryId: categoryIdByName[categoryName]!,
      },
    });
  }
  console.log(
    "Seeded",
    uniqueCategoryNames.length,
    "ingredient categories,",
    pairsSorted.length,
    "ingredient subcategories.",
  );

  const normalizedSet = new Set<string>();
  const mappedRows: Parameters<typeof prisma.ingredient.create>[0]["data"][] =
    [];
  let insertIndex = 0;
  for (let i = 0; i < items.length; i++) {
    const row = items[i] as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name)
      throw new Error(
        `data/seed/ingredients.json[${i}]: name must be non-empty after trim`,
      );
    const normalizedName = normalizeIngredientName(name);
    if (normalizedSet.has(normalizedName)) continue; // skip duplicates; first occurrence wins
    normalizedSet.add(normalizedName);

    const category =
      typeof row.category === "string" ? row.category.trim() : "";
    const subcategory =
      typeof row.subcategory === "string" ? row.subcategory.trim() : "";
    const gramsPerCupRaw = row.grams_per_cup;
    const costBasisUnitRaw = row.cost_basis_unit;
    const estimatedCentsRaw = row.estimated_cents_per_basis_unit;
    if (
      gramsPerCupRaw != null &&
      (typeof gramsPerCupRaw !== "number" || gramsPerCupRaw < 0)
    ) {
      throw new Error(
        `data/seed/ingredients.json[${i}]: grams_per_cup must be null or a number >= 0`,
      );
    }
    const costBasisUnit =
      costBasisUnitRaw === "GRAM" ||
      costBasisUnitRaw === "CUP" ||
      costBasisUnitRaw === "EACH"
        ? costBasisUnitRaw
        : "GRAM";
    if (
      estimatedCentsRaw != null &&
      (typeof estimatedCentsRaw !== "number" || estimatedCentsRaw < 0)
    ) {
      throw new Error(
        `data/seed/ingredients.json[${i}]: estimated_cents_per_basis_unit must be null or a number >= 0`,
      );
    }
    const conversionConfidence = row.conversion_confidence;
    const costConfidence = row.cost_confidence;
    if (
      typeof conversionConfidence !== "string" ||
      !CONFIDENCE_VALUES.includes(
        conversionConfidence as (typeof CONFIDENCE_VALUES)[number],
      )
    ) {
      throw new Error(
        `data/seed/ingredients.json[${i}]: conversion_confidence must be one of High, Medium, Low`,
      );
    }
    if (
      typeof costConfidence !== "string" ||
      !CONFIDENCE_VALUES.includes(
        costConfidence as (typeof CONFIDENCE_VALUES)[number],
      )
    ) {
      throw new Error(
        `data/seed/ingredients.json[${i}]: cost_confidence must be one of High, Medium, Low`,
      );
    }
    const notes = typeof row.notes === "string" ? row.notes : null;
    insertIndex += 1;
    mappedRows.push({
      id: seedId("ing", insertIndex),
      name,
      normalizedName,
      category: category || null,
      subcategory: subcategory || "",
      costBasisUnit,
      preferredDisplayUnit: getPreferredDisplayUnit(
        name,
        category,
        subcategory,
      ),
      estimatedCentsPerBasisUnit:
        estimatedCentsRaw != null && typeof estimatedCentsRaw === "number"
          ? estimatedCentsRaw
          : null,
      gramsPerCup:
        gramsPerCupRaw != null ? new Prisma.Decimal(gramsPerCupRaw) : null,
      conversionConfidence: conversionConfidence as "High" | "Medium" | "Low",
      costConfidence: costConfidence as "High" | "Medium" | "Low",
      notes,
    });
  }
  await prisma.ingredient.deleteMany({});
  for (let i = 0; i < mappedRows.length; i++) {
    await prisma.ingredient.create({ data: mappedRows[i]! });
  }
  console.log(
    "Seeded",
    mappedRows.length,
    "ingredients from data/seed/ingredients.json.",
  );

  const ingredientIdsByNormalizedName: Record<string, string> = {};
  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, normalizedName: true },
  });
  for (const i of ingredients) {
    ingredientIdsByNormalizedName[i.normalizedName] = i.id;
  }
  const fallbacks: [string, string][] = [
    ["eggs", "egg"],
    ["semi sweet chocolate chips", "chocolate chips"],
    ["flaky sea salt", "salt"],
    ["dark chocolate chips", "dark chocolate"],
    ["strong brewed coffee", "instant espresso powder"],
  ];
  for (const [target, canonical] of fallbacks) {
    if (
      !ingredientIdsByNormalizedName[target] &&
      ingredientIdsByNormalizedName[canonical]
    ) {
      ingredientIdsByNormalizedName[target] =
        ingredientIdsByNormalizedName[canonical]!;
    }
  }

  for (const { aliasNormalized, targetNormalizedName } of SEED_ALIASES) {
    const ingredientId = ingredientIdsByNormalizedName[targetNormalizedName];
    if (!ingredientId) continue;
    const norm = normalizeIngredientName(aliasNormalized);
    await prisma.ingredientAlias.upsert({
      where: { aliasNormalized: norm },
      create: { ingredientId, aliasNormalized: norm },
      update: { ingredientId },
    });
  }
  console.log("Seeded", SEED_ALIASES.length, "aliases.");

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
  const recipesData = JSON.parse(
    fs.readFileSync(recipesPath, "utf-8"),
  ) as RecipeSeed[];
  if (!Array.isArray(recipesData))
    throw new Error("data/seed/recipes.json must be a top-level array");

  const recipeIds: string[] = [];
  let riIndex = 0;
  for (let r = 0; r < recipesData.length; r++) {
    const rec = recipesData[r]!;
    const recipeId = seedId("recipe", r + 1);
    recipeIds.push(recipeId);
    await prisma.recipe.create({
      data: {
        id: recipeId,
        userId: user.id,
        title: rec.title,
        servings: rec.servings,
        prepTimeMinutes: rec.prepTimeMinutes,
        cookTimeMinutes: rec.cookTimeMinutes,
        totalTimeMinutes: rec.totalTimeMinutes,
      },
    });
    if (rec.instructions?.length) {
      await prisma.recipeInstruction.createMany({
        data: rec.instructions.map((text, sortOrder) => ({
          recipeId,
          sortOrder,
          text,
        })),
      });
    }
    for (let i = 0; i < (rec.ingredients ?? []).length; i++) {
      const row = rec.ingredients[i]!;
      const ingredientId = getIngId(row.ingredientNormalizedName);
      riIndex += 1;
      await prisma.recipeIngredient.create({
        data: {
          id: seedId("ri", riIndex),
          recipeId,
          ingredientId,
          quantity: row.quantity,
          rawQuantityText:
            row.originalLine.match(/^[\d\s./½¼¾⅓⅔⅛⅜⅝⅞]+/)?.[0]?.trim() ?? null,
          unit: row.unit as "CUP" | "TSP" | "TBSP" | "COUNT" | "OZ" | "PINCH",
          displayText: getDisplayTextFromIngredientLine(row.originalLine),
          rawText: row.originalLine,
          originalQuantity: row.quantity,
          originalUnit: row.unit as
            | "CUP"
            | "TSP"
            | "TBSP"
            | "COUNT"
            | "OZ"
            | "PINCH",
          sortOrder: i,
        },
      });
    }
    const tagIndexes = rec.tagIndexes ?? [];
    for (const ti of tagIndexes) {
      if (tagIds[ti] != null) {
        await prisma.recipeTag.create({
          data: { recipeId, tagId: tagIds[ti]! },
        });
      }
    }
  }
  console.log(
    "Seeded",
    recipeIds.length,
    "recipes with structured ingredients from data/seed/recipes.json.",
  );

  type OrderItemSeed = { recipeIndex: number; batches: number };
  type OrderSeed = { name: string; notes?: string; items: OrderItemSeed[] };

  const ordersPath = path.join(SEED_DATA_DIR, "orders.json");
  const ordersData = JSON.parse(
    fs.readFileSync(ordersPath, "utf-8"),
  ) as OrderSeed[];
  if (!Array.isArray(ordersData))
    throw new Error("data/seed/orders.json must be a top-level array");

  let oiIndex = 0;
  for (let o = 0; o < ordersData.length; o++) {
    const ord = ordersData[o]!;
    const orderId = o === 0 ? SEED_ORDER_ID : seedId("order", o + 1);
    await prisma.order.create({
      data: {
        id: orderId,
        userId: user.id,
        name: ord.name ?? "Untitled order",
        notes: ord.notes ?? null,
      },
    });
    for (const item of ord.items ?? []) {
      oiIndex += 1;
      const recipeId = recipeIds[item.recipeIndex];
      if (!recipeId)
        throw new Error(
          `data/seed/orders.json order ${o + 1}: invalid recipeIndex ${item.recipeIndex}`,
        );
      await prisma.orderItem.create({
        data: {
          id: seedId("oi", oiIndex),
          orderId,
          recipeId,
          batches: Math.max(1, item.batches),
        },
      });
    }
  }
  console.log(
    "Seeded",
    ordersData.length,
    "order(s) from data/seed/orders.json.",
  );

  console.log("Seed completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
