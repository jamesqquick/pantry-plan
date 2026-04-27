import type { MealSlot } from "@/db/schema/enums";

/** A single planned meal as served to the React island. */
export type PlannedMealItem = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  mealSlot: MealSlot;
  recipeId: string | null;
  customLabel: string | null;
  servings: number | null;
  recipe: { id: string; title: string } | null;
};

/** Recipe option for the "add meal" picker. */
export type RecipeOption = { id: string; title: string };
