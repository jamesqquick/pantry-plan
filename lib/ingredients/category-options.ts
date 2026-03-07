import { getDb } from "@/lib/db";

export type IngredientCategoryOption = { id: string; name: string };
export type IngredientSubcategoryOption = { id: string; name: string; ingredientCategoryId: string };

export type IngredientCategoryOptionsResult = {
  categories: IngredientCategoryOption[];
  subcategories: IngredientSubcategoryOption[];
  /** Nested shape for LLM prompts: categories with their subcategory names. */
  categoriesWithSubcategories: { name: string; subcategories: string[] }[];
};

/**
 * Returns all ingredient category and subcategory options (e.g. for LLM prompts when creating new ingredients).
 * Server-only; uses db.
 */
export async function getIngredientCategoryOptions(): Promise<IngredientCategoryOptionsResult> {
  const db = getDb();
  const [categories, subcategories] = await Promise.all([
    db.ingredientCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.ingredientSubcategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, ingredientCategoryId: true },
    }),
  ]);

  const subcategoriesByCategoryId = new Map<string, { id: string; name: string }[]>();
  for (const s of subcategories) {
    if (!subcategoriesByCategoryId.has(s.ingredientCategoryId)) {
      subcategoriesByCategoryId.set(s.ingredientCategoryId, []);
    }
    subcategoriesByCategoryId.get(s.ingredientCategoryId)!.push({ id: s.id, name: s.name });
  }

  type CategoryRow = (typeof categories)[number];
  type SubcategoryRow = (typeof subcategories)[number];
  const categoriesWithSubcategories = categories.map((c: CategoryRow) => ({
    name: c.name,
    subcategories: (subcategoriesByCategoryId.get(c.id) ?? []).map((s: { name: string }) => s.name),
  }));

  return {
    categories: categories.map((c: CategoryRow) => ({ id: c.id, name: c.name })),
    subcategories: subcategories.map((s: SubcategoryRow) => ({
      id: s.id,
      name: s.name,
      ingredientCategoryId: s.ingredientCategoryId,
    })),
    categoriesWithSubcategories,
  };
}
