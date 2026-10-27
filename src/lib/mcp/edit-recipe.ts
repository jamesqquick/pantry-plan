import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import type { EditRecipeToolInput } from "@/features/mcp/mcp.schemas";
import { chunkRows } from "@/db/chunked-insert";
import { validateIngredientMeasurements } from "@/features/recipes/ingredient-measurements";
import { RecipeNotFoundError } from "./recipe-errors";

export async function editMcpRecipe(
  db: Db,
  userId: string,
  input: EditRecipeToolInput,
): Promise<{ recipeId: string }> {
  const existingRows = await db
    .select({ id: recipe.id })
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

  const patch: Partial<typeof recipe.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl || null;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl || null;
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

  await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  return { recipeId: input.recipeId };
}
