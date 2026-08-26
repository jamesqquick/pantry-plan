import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import {
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeTag,
  tag,
} from "@/db";
import { chunkRows } from "@/db/chunked-insert";
import type { SaveImportedRecipeTextOnlyInput } from "@/features/import/import.schemas";
import { createId } from "@paralleldrive/cuid2";

export class RecipeCreationError extends Error {
  constructor() {
    super("Failed to create recipe");
    this.name = "RecipeCreationError";
  }
}

export async function filterOwnedTagIds(
  db: Db,
  userId: string,
  tagIds: readonly string[],
): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const owned = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.userId, userId), inArray(tag.id, [...tagIds])));
  return owned.map((row) => row.id);
}

export async function createTextOnlyRecipe(
  db: Db,
  userId: string,
  input: SaveImportedRecipeTextOnlyInput,
) {
  const { recipe: recipeData, ingredients } = input;
  const recipeId = createId();

  const validTagIds = await filterOwnedTagIds(db, userId, recipeData.tagIds);
  const instructionRows = recipeData.instructions.map((text, sortOrder) => ({
    recipeId,
    sortOrder,
    text: text.trim() || "—",
  }));
  const ingredientRows = ingredients.map((line, sortOrder) => ({
    recipeId,
    ingredientId: null,
    quantity: null,
    unit: null,
    displayText: line.trim(),
    rawText: line.trim(),
    sortOrder,
  }));
  const tagRows = validTagIds.map((tagId) => ({ recipeId, tagId }));

  const batchQueries = [
    db.insert(recipe).values({
      id: recipeId,
      userId,
      title: recipeData.title,
      sourceUrl: recipeData.sourceUrl || null,
      imageUrl: recipeData.imageUrl || null,
      servings: recipeData.servings ?? null,
      prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
      cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
      totalTimeMinutes: recipeData.totalTimeMinutes ?? null,
      notes: recipeData.notes ?? null,
    }),
    ...chunkRows(instructionRows, 4).map((chunk) =>
      db.insert(recipeInstruction).values(chunk),
    ),
    ...chunkRows(ingredientRows, 8).map((chunk) =>
      db.insert(recipeIngredient).values(chunk),
    ),
    ...chunkRows(tagRows, 3).map((chunk) => db.insert(recipeTag).values(chunk)),
  ];
  if (batchQueries.length > 0) {
    await db.batch(
      batchQueries as [(typeof batchQueries)[0], ...typeof batchQueries],
    );
  }

  return { recipeId };
}
