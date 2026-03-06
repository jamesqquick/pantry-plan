import type { CostBasisUnit } from "@/generated/prisma/client";
import { cacheTag } from "next/cache";
import { getDb } from "@/lib/db";

const PICKER_SEARCH_TAKE = 25;

export type CachedPickerIngredient = { id: string; name: string; source: "global" | "custom" };

export async function getCachedIngredientSearch(
  userId: string,
  query: string
): Promise<CachedPickerIngredient[]> {
  "use cache";
  cacheTag("ingredients");
  const ingredients = await listIngredientsForUser(userId, {
    search: query,
    take: PICKER_SEARCH_TAKE,
  });
  return ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    source: i.userId === null ? ("global" as const) : ("custom" as const),
  }));
}

export type IngredientCostInfo = {
  costBasisUnit: CostBasisUnit;
  estimatedCentsPerBasisUnit: number | null;
  gramsPerCup: number | null;
  cupsPerEach: number | null;
};

export async function getIngredientCostMap(): Promise<Map<string, IngredientCostInfo>> {
  const db = getDb();
  const ingredients = await db.ingredient.findMany({
    where: { userId: null },
    select: {
      normalizedName: true,
      costBasisUnit: true,
      estimatedCentsPerBasisUnit: true,
      gramsPerCup: true,
      cupsPerEach: true,
    },
  });
  const map = new Map<string, IngredientCostInfo>();
  for (const i of ingredients) {
    map.set(i.normalizedName, {
      costBasisUnit: i.costBasisUnit,
      estimatedCentsPerBasisUnit: i.estimatedCentsPerBasisUnit,
      gramsPerCup: i.gramsPerCup != null ? Number(i.gramsPerCup) : null,
      cupsPerEach: i.cupsPerEach ?? null,
    });
  }
  return map;
}

/** Scope: global (userId null) + current user's ingredients. */
function scopeGlobalAndUser(userId: string) {
  return { OR: [{ userId: null }, { userId }] };
}

function buildListWhere(
  userId: string,
  search: string | undefined,
  category: string | undefined
) {
  const conditions: Record<string, unknown>[] = [scopeGlobalAndUser(userId)];
  if (typeof search === "string" && search.trim().length > 0) {
    const term = search.trim();
    conditions.push({
      OR: [
        { name: { contains: term } },
        { normalizedName: { contains: term } },
      ],
    });
  }
  if (typeof category === "string" && category.trim().length > 0) {
    conditions.push({ category: category.trim() });
  }
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

export async function listIngredientsForUser(
  userId: string,
  options?: { search?: string; category?: string; limit?: number; skip?: number; take?: number }
) {
  const search =
    typeof options?.search === "string" && options.search.trim().length > 0
      ? options.search.trim()
      : undefined;
  const category =
    typeof options?.category === "string" && options.category.trim().length > 0
      ? options.category.trim()
      : undefined;
  const where = buildListWhere(userId, search, category);

  const take = options?.take ?? options?.limit;

  const db = getDb();
  return db.ingredient.findMany({
    where,
    orderBy: { normalizedName: "asc" },
    ...(options?.skip != null && { skip: options.skip }),
    ...(take != null && { take }),
  });
}

export async function countIngredientsForUser(
  userId: string,
  options?: { search?: string; category?: string }
): Promise<number> {
  const search =
    typeof options?.search === "string" && options.search.trim().length > 0
      ? options.search.trim()
      : undefined;
  const category =
    typeof options?.category === "string" && options.category.trim().length > 0
      ? options.category.trim()
      : undefined;
  const where = buildListWhere(userId, search, category);

  const db = getDb();
  return db.ingredient.count({ where });
}

export async function getIngredient(id: string) {
  const db = getDb();
  return db.ingredient.findUnique({
    where: { id },
  });
}
