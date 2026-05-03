import { ActionError, defineAction } from "astro:actions";
import { and, eq } from "drizzle-orm";
import {
  upsertPlannedMealSchema,
  updatePlannedMealSchema,
  plannedMealIdSchema,
  movePlannedMealSchema,
} from "@/features/meal-plan/meal-plan.schemas";
import { parseDateString } from "@/lib/meal-plan/week-dates";
import { plannedMeal, recipe } from "@/db";
import { getDb, requireUser } from "./_shared";

export const mealPlan = {
  /**
   * Create a planned meal for a (date, slot). If recipeId is supplied it
   * must belong to the caller. The schema enforces recipeId XOR customLabel.
   */
  upsert: defineAction({
    input: upsertPlannedMealSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();
      const date = parseDateString(input.date);

      if (input.recipeId) {
        const ownRecipe = await db
          .select({ id: recipe.id })
          .from(recipe)
          .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, user.id)))
          .limit(1);
        if (ownRecipe.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Recipe not found.",
          });
        }
      }

      const [row] = await db
        .insert(plannedMeal)
        .values({
          userId: user.id,
          date,
          mealSlot: input.mealSlot,
          recipeId: input.recipeId ?? null,
          customLabel: input.customLabel ?? null,
          servings: input.servings ?? null,
        })
        .returning({ id: plannedMeal.id });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create planned meal",
        });
      }
      return { id: row.id };
    },
  }),

  /**
   * Update a planned meal in place. Each field is optional; undefined = leave
   * alone. Passing `null` for recipeId/customLabel/servings clears them.
   */
  update: defineAction({
    input: updatePlannedMealSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existingRows = await db
        .select({ id: plannedMeal.id })
        .from(plannedMeal)
        .where(
          and(eq(plannedMeal.id, input.id), eq(plannedMeal.userId, user.id))
        )
        .limit(1);
      if (existingRows.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Planned meal not found.",
        });
      }

      // If a non-null recipeId is supplied, it must belong to the caller.
      // (recipeId === null means "clear"; undefined means "leave alone".)
      if (input.recipeId) {
        const ownRecipe = await db
          .select({ id: recipe.id })
          .from(recipe)
          .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, user.id)))
          .limit(1);
        if (ownRecipe.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Recipe not found.",
          });
        }
      }

      const patch: Partial<typeof plannedMeal.$inferInsert> = {};
      if (input.date != null) patch.date = parseDateString(input.date);
      if (input.mealSlot != null) patch.mealSlot = input.mealSlot;
      if (input.recipeId !== undefined) patch.recipeId = input.recipeId;
      if (input.customLabel !== undefined) patch.customLabel = input.customLabel;
      if (input.servings !== undefined) patch.servings = input.servings;

      if (Object.keys(patch).length > 0) {
        await db
          .update(plannedMeal)
          .set(patch)
          .where(eq(plannedMeal.id, input.id));
      }

      return { id: input.id };
    },
  }),

  /** Delete a planned meal. */
  delete: defineAction({
    accept: "form",
    input: plannedMealIdSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: plannedMeal.id })
        .from(plannedMeal)
        .where(
          and(eq(plannedMeal.id, input.id), eq(plannedMeal.userId, user.id))
        )
        .limit(1);
      if (existing.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Planned meal not found.",
        });
      }

      await db.delete(plannedMeal).where(eq(plannedMeal.id, input.id));
      return { id: input.id };
    },
  }),

  /** Move a planned meal to a different (date, slot). Used for drag-and-drop. */
  move: defineAction({
    input: movePlannedMealSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: plannedMeal.id })
        .from(plannedMeal)
        .where(
          and(eq(plannedMeal.id, input.id), eq(plannedMeal.userId, user.id))
        )
        .limit(1);
      if (existing.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Planned meal not found.",
        });
      }

      const newDate = parseDateString(input.date);
      await db
        .update(plannedMeal)
        .set({ date: newDate, mealSlot: input.mealSlot })
        .where(eq(plannedMeal.id, input.id));

      return { id: input.id };
    },
  }),

  // getWeekData: queries are inlined in the [weekStart].astro page frontmatter
  // (Phase 10) rather than as a separate action, since the page is server-rendered.
};
