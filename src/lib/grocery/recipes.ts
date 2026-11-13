import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { ingredient, recipe, recipeIngredient, type Db } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import { buildGroceryList, type GroceryListResult } from "./aggregate";

export type RecipeAvailabilityNotice = {
  code: "unmapped" | "missing-measurement" | "missing-price" | "missing-purchase-details" | "missing-conversion" | "cannot-combine";
  message: string;
  href?: string;
};

export type RecipeAvailability = {
  status: "checked" | "unavailable";
  notices: RecipeAvailabilityNotice[];
  quantityGroups?: Array<Pick<GroceryListResult["totals"][number],
    "ingredientId" | "basisUnit" | "gramsPerCup" | "gramsPerEach" | "cupsPerEach"
  >>;
};

type RecipeForGrocery = Parameters<typeof buildGroceryList>[0]["recipes"][number];

function unavailableFor(recipeIds: string[]): Record<string, RecipeAvailability> {
  return Object.fromEntries([...new Set(recipeIds)].map((id) => [
    id,
    { status: "unavailable", notices: [] },
  ]));
}

function missingCostNotice(issue: GroceryListResult["issues"]["missingCost"][number]): RecipeAvailabilityNotice {
  const reason = issue.reason === "missing-price"
    ? "Add a price to estimate this cost."
    : issue.reason === "missing-purchase-details"
      ? "Add the purchase amount and unit to estimate this cost."
      : "Add the required conversion to estimate this cost.";
  const code = issue.reason;
  return {
    code,
    message: `${issue.name}: ${reason}`,
    href: `/ingredients/${issue.ingredientId}`,
  };
}

export async function loadOwnedRecipeAvailability(
  db: Db,
  userId: string,
  recipeIds: string[],
): Promise<Record<string, RecipeAvailability>> {
  const requestedIds = [...new Set(recipeIds)];
  if (requestedIds.length === 0) return {};

  let ownedRecipes: Array<{ id: string; title: string }>;
  try {
    ownedRecipes = [];
    for (const ids of chunkInValues(requestedIds, 1)) {
      const rows = await db
        .select({ id: recipe.id, title: recipe.title })
        .from(recipe)
        .where(and(eq(recipe.userId, userId), inArray(recipe.id, ids)));
      ownedRecipes.push(...rows);
    }
  } catch {
    return unavailableFor(requestedIds);
  }

  if (ownedRecipes.length === 0) return {};
  const ownedIds = ownedRecipes.map(({ id }) => id);
  const availability: Record<string, RecipeAvailability> = Object.fromEntries(
    ownedRecipes.map(({ id }) => [id, { status: "checked", notices: [] }]),
  );

  try {
    const recipes = new Map<string, RecipeForGrocery>(
      ownedRecipes.map(({ id, title }) => [id, { id, title, ingredients: [] }]),
    );
    for (const ids of chunkInValues(ownedIds, 2)) {
      const rows = await db
        .select({
          recipeId: recipeIngredient.recipeId,
          recipeTitle: recipe.title,
          recipeIngredientId: recipeIngredient.id,
          ingredientId: recipeIngredient.ingredientId,
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          displayText: recipeIngredient.displayText,
          ingId: ingredient.id,
          ingName: ingredient.name,
          ingCostBasisUnit: ingredient.costBasisUnit,
          ingEstimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit,
          ingPurchasePriceCents: ingredient.purchasePriceCents,
          ingPurchaseQuantity: ingredient.purchaseQuantity,
          ingPurchaseUnit: ingredient.purchaseUnit,
          ingGramsPerCup: ingredient.gramsPerCup,
          ingGramsPerEach: ingredient.gramsPerEach,
          ingCupsPerEach: ingredient.cupsPerEach,
          ingPreferredDisplayUnit: ingredient.preferredDisplayUnit,
        })
        .from(recipeIngredient)
        .innerJoin(recipe, and(
          eq(recipe.id, recipeIngredient.recipeId),
          eq(recipe.userId, userId),
        ))
        .leftJoin(ingredient, and(
          eq(ingredient.id, recipeIngredient.ingredientId),
          or(isNull(ingredient.userId), eq(ingredient.userId, userId)),
        ))
        .where(inArray(recipeIngredient.recipeId, ids))
        .orderBy(asc(recipeIngredient.sortOrder));

      for (const row of rows) {
        recipes.get(row.recipeId)?.ingredients.push({
          id: row.recipeIngredientId,
          ingredientId: row.ingredientId,
          ingredient: row.ingId
            ? {
                id: row.ingId,
                name: row.ingName!,
                costBasisUnit: row.ingCostBasisUnit!,
                estimatedCentsPerBasisUnit: row.ingEstimatedCentsPerBasisUnit,
                purchasePriceCents: row.ingPurchasePriceCents,
                purchaseQuantity: row.ingPurchaseQuantity,
                purchaseUnit: row.ingPurchaseUnit,
                gramsPerCup: row.ingGramsPerCup,
                gramsPerEach: row.ingGramsPerEach,
                cupsPerEach: row.ingCupsPerEach,
                preferredDisplayUnit: row.ingPreferredDisplayUnit,
              }
            : null,
          quantity: row.quantity,
          unit: row.unit,
          displayText: row.displayText,
        });
      }
    }

    function addNotice(recipeId: string, notice: RecipeAvailabilityNotice) {
      const target = availability[recipeId];
      if (!target) return;
      const key = `${notice.code}\u0000${notice.href ?? ""}\u0000${notice.message}`;
      if (!target.notices.some((existing) => `${existing.code}\u0000${existing.href ?? ""}\u0000${existing.message}` === key)) {
        target.notices.push(notice);
      }
    }

    const recipeEditHref = (recipeId: string) => `/recipes/${recipeId}/edit#recipe-ingredients`;
    for (const recipeData of recipes.values()) {
      const grocery = buildGroceryList({
        orderItems: [{ recipeId: recipeData.id, batches: 1 }],
        recipes: [recipeData],
      });
      availability[recipeData.id]!.quantityGroups = grocery.totals.map((group) => ({
        ingredientId: group.ingredientId,
        basisUnit: group.basisUnit,
        gramsPerCup: group.gramsPerCup,
        gramsPerEach: group.gramsPerEach,
        cupsPerEach: group.cupsPerEach,
      }));

      for (const issue of grocery.issues.unmapped) {
        addNotice(issue.recipeId, {
          code: "unmapped",
          message: `Map “${issue.displayText}” to an ingredient.`,
          href: recipeEditHref(issue.recipeId),
        });
      }
      for (const issue of grocery.issues.missingQuantityOrUnit) {
        addNotice(issue.recipeId, {
          code: "missing-measurement",
          message: "A recipe line needs a quantity and unit.",
          href: recipeEditHref(issue.recipeId),
        });
      }
      for (const issue of grocery.issues.cannotConvert) {
        if (issue.kind === "missing-ingredient") {
          addNotice(issue.recipeId, {
            code: "unmapped",
            message: "A mapped ingredient is unavailable to this account. Check the recipe mapping.",
            href: recipeEditHref(issue.recipeId),
          });
        } else {
          addNotice(issue.recipeId, {
            code: issue.kind === "cannot-combine" ? "cannot-combine" : "missing-conversion",
            message: issue.reason,
            ...(issue.ingredientId ? { href: `/ingredients/${issue.ingredientId}` } : { href: recipeEditHref(issue.recipeId) }),
          });
        }
      }
      for (const issue of grocery.issues.missingCost) {
        for (const source of issue.sources) addNotice(source.recipeId, missingCostNotice(issue));
      }
    }

    return availability;
  } catch {
    return Object.fromEntries(ownedIds.map((id) => [
      id,
      { status: "unavailable", notices: [] },
    ]));
  }
}
