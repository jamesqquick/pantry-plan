import { ActionError, defineAction } from "astro:actions";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeIdSchema,
  duplicateRecipeSchema,
} from "@/features/recipes/recipes.schemas";
import { setRecipeIngredientsSchema } from "@/features/recipes/recipe-ingredients.schemas";
import {
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeTag,
  tag,
} from "@/db";
import { getDb, requireUser } from "./_shared";

/**
 * Recipes submit complex nested data (ingredients + instructions + tags).
 * Rather than pry it out of FormData, these actions accept JSON payloads
 * shaped like the Zod schemas. Client islands serialize their state before
 * calling `actions.recipes.create({...})`.
 */

// Input schema for create/update includes the nested structured ingredients
// (unlike the raw Zod schema which only covers the recipe core fields).
const recipeCreateInputSchema = recipeCreateSchema.extend({
  ingredientsStructured: z
    .array(
      setRecipeIngredientsSchema.shape.items.element // single item schema
    )
    .optional()
    .default([]),
});

const recipeUpdateInputSchema = recipeUpdateSchema.extend({
  ingredientsStructured: z
    .array(setRecipeIngredientsSchema.shape.items.element)
    .optional(),
});

/**
 * Filter tagIds to ones the user actually owns. Prevents cross-user tag
 * assignment via forged input.
 */
async function filterOwnedTagIds(
  db: ReturnType<typeof getDb>,
  userId: string,
  tagIds: readonly string[]
): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const owned = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.userId, userId), inArray(tag.id, [...tagIds])));
  const ownedSet = new Set(owned.map((r) => r.id));
  return tagIds.filter((id) => ownedSet.has(id));
}

export const recipes = {
  /**
   * Create a recipe with structured ingredients, instructions, and tags.
   * Returns the new id; the client is expected to navigate to it.
   */
  create: defineAction({
    input: recipeCreateInputSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const [row] = await db
        .insert(recipe)
        .values({
          userId: user.id,
          title: input.title,
          sourceUrl: input.sourceUrl || null,
          imageUrl: input.imageUrl || null,
          servings: input.servings ?? null,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          cookTimeMinutes: input.cookTimeMinutes ?? null,
          totalTimeMinutes: input.totalTimeMinutes ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: recipe.id });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create recipe",
        });
      }
      const recipeId = row.id;

      if (input.instructions.length > 0) {
        await db.insert(recipeInstruction).values(
          input.instructions.map((text, sortOrder) => ({
            recipeId,
            sortOrder,
            text: text.trim() || "—",
          }))
        );
      }

      if (input.ingredientsStructured.length > 0) {
        await db.insert(recipeIngredient).values(
          input.ingredientsStructured.map((item) => ({
            recipeId,
            ingredientId:
              item.ingredientId && item.ingredientId !== ""
                ? item.ingredientId
                : null,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            displayText: item.displayText.trim() || "—",
            rawText: item.rawText?.trim() || null,
            sortOrder: item.sortOrder,
          }))
        );
      }

      const validTagIds = await filterOwnedTagIds(db, user.id, input.tagIds);
      if (validTagIds.length > 0) {
        await db
          .insert(recipeTag)
          .values(validTagIds.map((tagId) => ({ recipeId, tagId })));
      }

      return { id: recipeId };
    },
  }),

  /**
   * Update a recipe. Only provided fields change. Instructions/ingredients/
   * tags are replace-in-full when their arrays are supplied (undefined = leave
   * alone).
   */
  update: defineAction({
    input: recipeUpdateInputSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existingRows = await db
        .select({ id: recipe.id, userId: recipe.userId })
        .from(recipe)
        .where(eq(recipe.id, input.id))
        .limit(1);
      if (existingRows.length === 0 || existingRows[0]!.userId !== user.id) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      // Build partial update for core fields — only set what was provided.
      const patch: Partial<typeof recipe.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl || null;
      if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl || null;
      if (input.servings !== undefined) patch.servings = input.servings ?? null;
      if (input.prepTimeMinutes !== undefined)
        patch.prepTimeMinutes = input.prepTimeMinutes ?? null;
      if (input.cookTimeMinutes !== undefined)
        patch.cookTimeMinutes = input.cookTimeMinutes ?? null;
      if (input.totalTimeMinutes !== undefined)
        patch.totalTimeMinutes = input.totalTimeMinutes ?? null;
      if (input.notes !== undefined) patch.notes = input.notes ?? null;

      if (Object.keys(patch).length > 0) {
        await db.update(recipe).set(patch).where(eq(recipe.id, input.id));
      }

      if (input.instructions !== undefined) {
        await db
          .delete(recipeInstruction)
          .where(eq(recipeInstruction.recipeId, input.id));
        if (input.instructions.length > 0) {
          await db.insert(recipeInstruction).values(
            input.instructions.map((text, sortOrder) => ({
              recipeId: input.id,
              sortOrder,
              text: text.trim() || "—",
            }))
          );
        }
      }

      if (input.ingredientsStructured !== undefined) {
        await db
          .delete(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, input.id));
        if (input.ingredientsStructured.length > 0) {
          await db.insert(recipeIngredient).values(
            input.ingredientsStructured.map((item) => ({
              recipeId: input.id,
              ingredientId:
                item.ingredientId && item.ingredientId !== ""
                  ? item.ingredientId
                  : null,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
              displayText: item.displayText.trim() || "—",
              rawText: item.rawText?.trim() || null,
              sortOrder: item.sortOrder,
            }))
          );
        }
      }

      if (input.tagIds !== undefined) {
        const validTagIds = await filterOwnedTagIds(db, user.id, input.tagIds);
        await db.delete(recipeTag).where(eq(recipeTag.recipeId, input.id));
        if (validTagIds.length > 0) {
          await db
            .insert(recipeTag)
            .values(validTagIds.map((tagId) => ({ recipeId: input.id, tagId })));
        }
      }

      return { id: input.id };
    },
  }),

  /**
   * Delete a recipe (cascades to instructions, ingredients, tags via FKs).
   */
  delete: defineAction({
    accept: "form",
    input: recipeIdSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existingRows = await db
        .select({ userId: recipe.userId })
        .from(recipe)
        .where(eq(recipe.id, input.id))
        .limit(1);
      if (existingRows.length === 0 || existingRows[0]!.userId !== user.id) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      await db.delete(recipe).where(eq(recipe.id, input.id));
      return { id: input.id };
    },
  }),

  /**
   * Deep-copy a recipe (instructions, ingredients, and owned tags). Titled
   * "Copy of {original}". Returns the new id.
   */
  duplicate: defineAction({
    accept: "form",
    input: duplicateRecipeSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const sourceRows = await db
        .select()
        .from(recipe)
        .where(eq(recipe.id, input.recipeId))
        .limit(1);
      if (sourceRows.length === 0 || sourceRows[0]!.userId !== user.id) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }
      const source = sourceRows[0]!;

      const [copy] = await db
        .insert(recipe)
        .values({
          userId: user.id,
          title: `Copy of ${source.title}`,
          sourceUrl: source.sourceUrl,
          imageUrl: source.imageUrl,
          servings: source.servings,
          prepTimeMinutes: source.prepTimeMinutes,
          cookTimeMinutes: source.cookTimeMinutes,
          totalTimeMinutes: source.totalTimeMinutes,
          notes: source.notes,
        })
        .returning({ id: recipe.id });
      if (!copy) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to duplicate recipe",
        });
      }

      const [insts, rings, rtags] = await Promise.all([
        db
          .select()
          .from(recipeInstruction)
          .where(eq(recipeInstruction.recipeId, input.recipeId)),
        db
          .select()
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, input.recipeId)),
        db
          .select({ tagId: recipeTag.tagId })
          .from(recipeTag)
          .where(eq(recipeTag.recipeId, input.recipeId)),
      ]);

      if (insts.length > 0) {
        await db.insert(recipeInstruction).values(
          insts.map((i) => ({
            recipeId: copy.id,
            sortOrder: i.sortOrder,
            text: i.text,
          }))
        );
      }
      if (rings.length > 0) {
        await db.insert(recipeIngredient).values(
          rings.map((ri, idx) => ({
            recipeId: copy.id,
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
            unit: ri.unit,
            displayText: ri.displayText,
            rawText: ri.rawText,
            sortOrder: ri.sortOrder ?? idx,
          }))
        );
      }
      if (rtags.length > 0) {
        const tagIds = rtags.map((r) => r.tagId);
        const validTagIds = await filterOwnedTagIds(db, user.id, tagIds);
        if (validTagIds.length > 0) {
          await db
            .insert(recipeTag)
            .values(
              validTagIds.map((tagId) => ({ recipeId: copy.id, tagId }))
            );
        }
      }

      return { id: copy.id };
    },
  }),
};
