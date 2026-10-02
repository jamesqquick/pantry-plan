import { createId } from "@paralleldrive/cuid2";
import type { Db } from "@/db";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import type { CreateRecipeToolInput } from "@/features/mcp/mcp.schemas";
import { chunkRows } from "@/db/chunked-insert";

export async function createMcpRecipe(
  db: Db,
  userId: string,
  input: CreateRecipeToolInput,
): Promise<{ recipeId: string }> {
  const recipeId = createId();
  const instructionRows = input.instructions.map((text, sortOrder) => ({
    recipeId,
    sortOrder,
    text: text.trim(),
  }));
  const ingredientRows = input.ingredients.map((item, sortOrder) => ({
    recipeId,
    ingredientId: null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    displayText: item.displayText.trim(),
    rawText: item.rawText?.trim() || null,
    sortOrder,
  }));

  const statements = [
    db.insert(recipe).values({
      id: recipeId,
      userId,
      title: input.title,
      sourceUrl: input.sourceUrl || null,
      imageUrl: input.imageUrl || null,
      servings: input.servings ?? null,
      prepTimeMinutes: input.prepTimeMinutes ?? null,
      cookTimeMinutes: input.cookTimeMinutes ?? null,
      totalTimeMinutes: input.totalTimeMinutes ?? null,
      notes: input.notes ?? null,
    }),
    ...chunkRows(instructionRows, 4).map((chunk) =>
      db.insert(recipeInstruction).values(chunk),
    ),
    ...chunkRows(ingredientRows, 8).map((chunk) =>
      db.insert(recipeIngredient).values(chunk),
    ),
  ];

  await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
  return { recipeId };
}
