import { ActionError, defineAction } from "astro:actions";
import { and, eq } from "drizzle-orm";
import { setRecipeIngredientsSchema } from "@/features/recipes/recipe-ingredients.schemas";
import { recipe, recipeIngredient } from "@/db";
import { getDb, requireUser } from "./_shared";

export const recipeIngredients = {
  /**
   * Replace-in-full the ingredient list for a recipe. Empty items array
   * clears all rows. Owner check: the recipe must belong to the caller.
   */
  set: defineAction({
    input: setRecipeIngredientsSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: recipe.id })
        .from(recipe)
        .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, user.id)))
        .limit(1);
      if (existing.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      // D1 doesn't support transactions across statements in a single call
      // from Drizzle, but the sequence here is delete-then-insert and both
      // are fine to retry. If the insert fails, the worst case is an empty
      // ingredient list — user can resubmit.
      await db
        .delete(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, input.recipeId));

      if (input.items.length > 0) {
        await db.insert(recipeIngredient).values(
          input.items.map((item) => ({
            recipeId: input.recipeId,
            ingredientId:
              item.ingredientId && item.ingredientId !== ""
                ? item.ingredientId
                : null,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            displayText: item.displayText?.trim() || "—",
            rawText: item.rawText?.trim() || null,
            sortOrder: item.sortOrder,
          }))
        );
      }

      return { recipeId: input.recipeId };
    },
  }),
};
