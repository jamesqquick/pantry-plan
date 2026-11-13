import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { recipe, recipeIngredient, recipeInstruction, recipeTag } from "@/db";
import type { EditRecipeToolInput } from "@/features/mcp/mcp.schemas";
import { chunkRows } from "@/db/chunked-insert";
import { validateIngredientMeasurements } from "@/features/recipes/ingredient-measurements";
import { RecipeNotFoundError } from "./recipe-errors";
import { mcpRecipeTagStatements } from "./recipe-tags";
import { fetchRecipePhoto, putRecipePhoto, recipePhotoKey, recipePhotoUrl, removeRecipePhoto, type RecipePhotoStorage } from "@/lib/recipes/recipe-photos";
import { RecipePhotoStorageUnavailableError } from "./create-recipe";

export async function editMcpRecipe(
  db: Db,
  userId: string,
  input: EditRecipeToolInput,
  photoStorage?: RecipePhotoStorage,
): Promise<{ recipeId: string }> {
  const existingRows = await db
    .select({ id: recipe.id, imageUrl: recipe.imageUrl, imageStorageKey: recipe.imageStorageKey })
    .from(recipe)
    .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, userId)))
    .limit(1);
  if (existingRows.length === 0) throw new RecipeNotFoundError();

  const effectiveIngredients =
    input.ingredients ??
    (await db
      .select({
        quantity: recipeIngredient.quantity,
        unit: recipeIngredient.unit,
        displayText: recipeIngredient.displayText,
      })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, input.recipeId))
      .orderBy(recipeIngredient.sortOrder));
  validateIngredientMeasurements(effectiveIngredients);

  const photo = input.photoSourceUrl ? await fetchRecipePhoto(input.photoSourceUrl) : null;
  if (photo && !photoStorage) throw new RecipePhotoStorageUnavailableError();
  const previous = existingRows[0]!;
  const previousObject = photo && previous.imageStorageKey && photoStorage
    ? await photoStorage.bucket.get(previous.imageStorageKey)
    : null;
  if (photo && photoStorage) await putRecipePhoto(photoStorage.bucket, input.recipeId, photo.bytes, photo.contentType);

  const patch: Partial<typeof recipe.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl || null;
  if (photo) {
    patch.imageUrl = recipePhotoUrl(input.recipeId, photoStorage?.publicUrl);
    patch.imageStorageKey = recipePhotoKey(input.recipeId);
  } else if (input.imageUrl !== undefined && input.imageUrl !== previous.imageUrl) {
    patch.imageUrl = input.imageUrl || null;
    patch.imageStorageKey = null;
  }
  if (input.servings !== undefined) patch.servings = input.servings;
  if (input.prepTimeMinutes !== undefined) {
    patch.prepTimeMinutes = input.prepTimeMinutes;
  }
  if (input.cookTimeMinutes !== undefined) {
    patch.cookTimeMinutes = input.cookTimeMinutes;
  }
  if (input.totalTimeMinutes !== undefined) {
    patch.totalTimeMinutes = input.totalTimeMinutes;
  }
  if (input.notes !== undefined) patch.notes = input.notes;

  const statements: unknown[] = [
    db
      .update(recipe)
      .set(patch)
      .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, userId))),
  ];

  if (input.instructions !== undefined) {
    statements.push(
      db
        .delete(recipeInstruction)
        .where(eq(recipeInstruction.recipeId, input.recipeId)),
      ...chunkRows(
        input.instructions.map((text, sortOrder) => ({
          recipeId: input.recipeId,
          sortOrder,
          text: text.trim(),
        })),
        4,
      ).map((chunk) => db.insert(recipeInstruction).values(chunk)),
    );
  }

  if (input.ingredients !== undefined) {
    statements.push(
      db
        .delete(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, input.recipeId)),
      ...chunkRows(
        input.ingredients.map((item, sortOrder) => ({
          recipeId: input.recipeId,
          ingredientId: null,
          quantity: item.quantity,
          unit: item.unit,
          displayText: item.displayText.trim(),
          rawText: item.rawText ?? null,
          sortOrder,
        })),
        8,
      ).map((chunk) => db.insert(recipeIngredient).values(chunk)),
    );
  }

  if (input.tags !== undefined) {
    statements.push(
      db.delete(recipeTag).where(eq(recipeTag.recipeId, input.recipeId)),
      ...mcpRecipeTagStatements(db, userId, input.recipeId, input.tags),
    );
  }

  try {
    await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  } catch (error) {
    if (photo && photoStorage) {
      if (previousObject) {
        await photoStorage.bucket.put(recipePhotoKey(input.recipeId), previousObject.body, { httpMetadata: previousObject.httpMetadata });
      } else {
        await removeRecipePhoto(photoStorage.bucket, recipePhotoKey(input.recipeId));
      }
    }
    throw error;
  }
  if (patch.imageStorageKey === null && previous.imageStorageKey && photoStorage) {
    await removeRecipePhoto(photoStorage.bucket, previous.imageStorageKey);
  }
  return { recipeId: input.recipeId };
}
