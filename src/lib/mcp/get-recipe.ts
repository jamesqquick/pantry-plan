import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import type { McpRecipeIngredient } from "@/features/mcp/mcp.schemas";
import { RecipeNotFoundError } from "./recipe-errors";

export type McpRecipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  notes: string | null;
  ingredients: McpRecipeIngredient[];
  instructions: string[];
};

export async function getMcpRecipe(
  db: Db,
  userId: string,
  recipeId: string,
): Promise<McpRecipe> {
  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      sourceUrl: recipe.sourceUrl,
      imageUrl: recipe.imageUrl,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
      notes: recipe.notes,
    })
    .from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new RecipeNotFoundError();

  const [ingredients, instructions] = await Promise.all([
    db
      .select({
        quantity: recipeIngredient.quantity,
        unit: recipeIngredient.unit,
        displayText: recipeIngredient.displayText,
        rawText: recipeIngredient.rawText,
      })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, recipeId))
      .orderBy(asc(recipeIngredient.sortOrder)),
    db
      .select({ text: recipeInstruction.text })
      .from(recipeInstruction)
      .where(eq(recipeInstruction.recipeId, recipeId))
      .orderBy(asc(recipeInstruction.sortOrder)),
  ]);

  return {
    ...row,
    ingredients,
    instructions: instructions.map((instruction) => instruction.text),
  };
}
