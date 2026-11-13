import { ActionError, defineAction } from "astro:actions";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeIdSchema,
  duplicateRecipeSchema,
} from "@/features/recipes/recipes.schemas";
import { setRecipeIngredientsSchema } from "@/features/recipes/recipe-ingredients.schemas";
import {
  IngredientMeasurementValidationError,
  validateIngredientMeasurements,
} from "@/features/recipes/ingredient-measurements";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeTag,
  tag,
} from "@/db";
import { chunkRows } from "@/db/chunked-insert";
import { chunkInValues } from "@/db/chunked-read";
import {
  buildPreferredIngredientMap,
  NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
} from "@/lib/ingredients/recipe-mapping";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { getDb, queueSearchSync, requireUser } from "./_shared";

/**
 * Recipes submit complex nested data (ingredients + instructions + tags).
 * Rather than pry it out of FormData, these actions accept JSON payloads
 * shaped like the Zod schemas. Client islands serialize their state before
 * calling `actions.recipes.create({...})`.
 */

// Input schema for create/update includes the nested structured ingredients
// (unlike the raw Zod schema which only covers the recipe core fields).
const recipeEditorIngredientSchema = setRecipeIngredientsSchema.shape.items.element
  .extend({
    createIngredientName: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((item, context) => {
    if (item.createIngredientName && item.ingredientId) {
      context.addIssue({
        code: "custom",
        path: ["createIngredientName"],
        message: "Choose an existing ingredient or create a new one, not both.",
      });
    }
  });

type RecipeEditorIngredientInput = z.infer<typeof recipeEditorIngredientSchema>;
type ResolvedRecipeIngredientInput = Omit<
  RecipeEditorIngredientInput,
  "createIngredientName"
>;

const recipeCreateInputSchema = recipeCreateSchema.extend({
  ingredientsStructured: z
    .array(recipeEditorIngredientSchema)
    .optional()
    .default([]),
});

const recipeUpdateInputSchema = recipeUpdateSchema.extend({
  // Omitted tags must not inherit the create schema's empty-array default.
  tagIds: recipeCreateSchema.shape.tagIds.unwrap(),
  ingredientsStructured: z.array(recipeEditorIngredientSchema).optional(),
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

async function validateIngredientReferences(
  db: ReturnType<typeof getDb>,
  userId: string,
  items: readonly { ingredientId?: string }[]
): Promise<void> {
  const ids = [
    ...new Set(items.flatMap((item) => item.ingredientId ? [item.ingredientId] : [])),
  ];
  for (const chunk of chunkInValues(ids, 1)) {
    const accessible = await db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(
        and(
          inArray(ingredient.id, chunk),
          or(isNull(ingredient.userId), eq(ingredient.userId, userId))
        )
      );
    if (accessible.length !== chunk.length) {
      throw new ActionError({
        code: "FORBIDDEN",
        message: "An ingredient was not found or does not belong to you.",
      });
    }
  }
}

async function resolveRecipeIngredientCreates(
  db: ReturnType<typeof getDb>,
  userId: string,
  items: readonly RecipeEditorIngredientInput[],
): Promise<{
  items: ResolvedRecipeIngredientInput[];
  insertStatements: BatchItem<"sqlite">[];
}> {
  const createNames = new Map<string, string>();
  for (const item of items) {
    if (!item.createIngredientName) continue;
    const normalizedName = normalizeIngredientName(item.createIngredientName);
    if (!normalizedName) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Ingredient name must contain letters or numbers.",
      });
    }
    if (!createNames.has(normalizedName)) {
      createNames.set(normalizedName, item.createIngredientName);
    }
  }

  const normalizedNames = [...createNames.keys()];
  const matchingIngredients: Array<{
    id: string;
    normalizedName: string;
    userId: string | null;
  }> = [];
  for (const names of chunkInValues(normalizedNames, 1)) {
    const rows = await db
      .select({
        id: ingredient.id,
        normalizedName: ingredient.normalizedName,
        userId: ingredient.userId,
      })
      .from(ingredient)
      .where(
        and(
          inArray(ingredient.normalizedName, names),
          or(isNull(ingredient.userId), eq(ingredient.userId, userId)),
        ),
      );
    matchingIngredients.push(...rows);
  }

  const preferredIngredients = buildPreferredIngredientMap(
    matchingIngredients,
    userId,
  );
  const newIngredients = normalizedNames
    .filter((normalizedName) => !preferredIngredients.has(normalizedName))
    .map((normalizedName) => ({
      id: createId(),
      userId,
      name: createNames.get(normalizedName)!,
      normalizedName,
      costBasisUnit: "G" as const,
    }));
  const ingredientIdByNormalizedName = new Map(
    [...preferredIngredients].map(([normalizedName, row]) => [
      normalizedName,
      row.id,
    ]),
  );
  for (const row of newIngredients) {
    ingredientIdByNormalizedName.set(row.normalizedName, row.id);
  }

  const resolvedItems = items.map((item): ResolvedRecipeIngredientInput => {
    const { createIngredientName, ...resolvedItem } = item;
    if (!createIngredientName) return resolvedItem;

    const ingredientId = ingredientIdByNormalizedName.get(
      normalizeIngredientName(createIngredientName),
    );
    if (!ingredientId) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to resolve the new catalog ingredient.",
      });
    }
    return { ...resolvedItem, ingredientId };
  });

  return {
    items: resolvedItems,
    insertStatements: chunkRows(
      newIngredients,
      NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
    ).map((rows) => db.insert(ingredient).values(rows)),
  };
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

      await validateIngredientReferences(
        db,
        user.id,
        input.ingredientsStructured.filter((item) => !item.createIngredientName),
      );
      const ingredientResolution = await resolveRecipeIngredientCreates(
        db,
        user.id,
        input.ingredientsStructured,
      );
      const validTagIds = await filterOwnedTagIds(db, user.id, input.tagIds);
      const recipeId = createId();

      // Chunk bulk inserts to stay under D1's bound-parameter cap.
      // Param counts incl. cuid id: instruction=4, ingredient=8, tag=3.
      const instructionRows = input.instructions.map((text, sortOrder) => ({
        recipeId,
        sortOrder,
        text: text.trim() || "—",
      }));
      const ingredientRows = ingredientResolution.items.map((item) => ({
        recipeId,
        ingredientId:
          item.ingredientId && item.ingredientId !== ""
            ? item.ingredientId
            : null,
        quantity: item.quantity,
        unit: item.unit,
        displayText: item.displayText.trim() || "—",
        rawText: item.rawText ?? null,
        sortOrder: item.sortOrder,
      }));
      const tagRows = validTagIds.map((tagId) => ({ recipeId, tagId }));

      await db.batch([
        db.insert(recipe).values({
          id: recipeId,
          userId: user.id,
          title: input.title,
          sourceUrl: input.sourceUrl || null,
          imageUrl: input.imageUrl || null,
          servings: input.servings ?? null,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          cookTimeMinutes: input.cookTimeMinutes ?? null,
          totalTimeMinutes: input.totalTimeMinutes ?? null,
          notes: input.notes ?? null,
        }),
        ...ingredientResolution.insertStatements,
        ...chunkRows(instructionRows, 4).map((chunk) =>
          db.insert(recipeInstruction).values(chunk)
        ),
        ...chunkRows(ingredientRows, 8).map((chunk) =>
          db.insert(recipeIngredient).values(chunk)
        ),
        ...chunkRows(tagRows, 3).map((chunk) => db.insert(recipeTag).values(chunk)),
      ]);

      await queueSearchSync(ctx, db, [recipeId]);
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

      const effectiveIngredients =
        input.ingredientsStructured ??
        (await db
          .select({
            quantity: recipeIngredient.quantity,
            unit: recipeIngredient.unit,
            displayText: recipeIngredient.displayText,
          })
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, input.id))
          .orderBy(recipeIngredient.sortOrder));
      try {
        validateIngredientMeasurements(effectiveIngredients);
      } catch (error) {
        if (!(error instanceof IngredientMeasurementValidationError)) throw error;
        throw new ActionError({ code: "BAD_REQUEST", message: error.message });
      }

      let ingredientResolution: {
        items: ResolvedRecipeIngredientInput[];
        insertStatements: BatchItem<"sqlite">[];
      } | null = null;
      if (input.ingredientsStructured !== undefined) {
        await validateIngredientReferences(
          db,
          user.id,
          input.ingredientsStructured.filter((item) => !item.createIngredientName),
        );
        ingredientResolution = await resolveRecipeIngredientCreates(
          db,
          user.id,
          input.ingredientsStructured,
        );
      }
      const validTagIds = input.tagIds !== undefined
        ? await filterOwnedTagIds(db, user.id, input.tagIds)
        : undefined;

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

      const statements: BatchItem<"sqlite">[] = [
        ...(ingredientResolution?.insertStatements ?? []),
      ];
      if (Object.keys(patch).length > 0) {
        statements.push(
          db.update(recipe).set(patch)
            .where(and(eq(recipe.id, input.id), eq(recipe.userId, user.id)))
        );
      }

      if (input.instructions !== undefined) {
        statements.push(
          db.delete(recipeInstruction)
            .where(eq(recipeInstruction.recipeId, input.id))
        );
        const instructionRows = input.instructions.map((text, sortOrder) => ({
          recipeId: input.id,
          sortOrder,
          text: text.trim() || "—",
        }));
        for (const chunk of chunkRows(instructionRows, 4)) {
          statements.push(db.insert(recipeInstruction).values(chunk));
        }
      }

      if (ingredientResolution) {
        statements.push(
          db.delete(recipeIngredient)
            .where(eq(recipeIngredient.recipeId, input.id))
        );
        const ingredientRows = ingredientResolution.items.map((item) => ({
          recipeId: input.id,
          ingredientId:
            item.ingredientId && item.ingredientId !== ""
              ? item.ingredientId
              : null,
          quantity: item.quantity,
          unit: item.unit,
          displayText: item.displayText.trim() || "—",
          rawText: item.rawText ?? null,
          sortOrder: item.sortOrder,
        }));
        for (const chunk of chunkRows(ingredientRows, 8)) {
          statements.push(db.insert(recipeIngredient).values(chunk));
        }
      }

      if (validTagIds !== undefined) {
        statements.push(db.delete(recipeTag).where(eq(recipeTag.recipeId, input.id)));
        const tagRows = validTagIds.map((tagId) => ({
          recipeId: input.id,
          tagId,
        }));
        for (const chunk of chunkRows(tagRows, 3)) {
          statements.push(db.insert(recipeTag).values(chunk));
        }
      }

      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);

      await queueSearchSync(ctx, db, [input.id]);
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
      await queueSearchSync(ctx, db, [input.id]);
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

      const rings = await db
        .select()
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, input.recipeId))
        .orderBy(recipeIngredient.sortOrder);
      try {
        validateIngredientMeasurements(rings);
      } catch (error) {
        if (!(error instanceof IngredientMeasurementValidationError)) throw error;
        throw new ActionError({ code: "BAD_REQUEST", message: error.message });
      }

      const copyId = createId();

      const [insts, rtags] = await Promise.all([
        db
          .select()
          .from(recipeInstruction)
          .where(eq(recipeInstruction.recipeId, input.recipeId)),
        db
          .select({ tagId: recipeTag.tagId })
          .from(recipeTag)
          .where(eq(recipeTag.recipeId, input.recipeId)),
      ]);

      const instructionRows = insts.map((i) => ({
        recipeId: copyId,
        sortOrder: i.sortOrder,
        text: i.text,
      }));

      const ingredientRows = rings.map((ri, idx) => ({
        recipeId: copyId,
        ingredientId: ri.ingredientId,
        quantity: ri.quantity,
        unit: ri.unit,
        displayText: ri.displayText,
        rawText: ri.rawText,
        sortOrder: ri.sortOrder ?? idx,
      }));
      const validTagIds = await filterOwnedTagIds(db, user.id, rtags.map((r) => r.tagId));
      const tagRows = validTagIds.map((tagId) => ({ recipeId: copyId, tagId }));
      await db.batch([
        db.insert(recipe).values({
          id: copyId,
          userId: user.id,
          title: `Copy of ${source.title}`,
          sourceUrl: source.sourceUrl,
          imageUrl: source.imageUrl,
          servings: source.servings,
          prepTimeMinutes: source.prepTimeMinutes,
          cookTimeMinutes: source.cookTimeMinutes,
          totalTimeMinutes: source.totalTimeMinutes,
          notes: source.notes,
        }),
        ...chunkRows(instructionRows, 4).map((chunk) => db.insert(recipeInstruction).values(chunk)),
        ...chunkRows(ingredientRows, 8).map((chunk) => db.insert(recipeIngredient).values(chunk)),
        ...chunkRows(tagRows, 3).map((chunk) => db.insert(recipeTag).values(chunk)),
      ]);

      await queueSearchSync(ctx, db, [copyId]);
      return { id: copyId };
    },
  }),
};
