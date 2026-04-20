import { tags } from "./tags";
import { ingredients } from "./ingredients";
import { recipes } from "./recipes";
import { recipeIngredients } from "./recipe-ingredients";
import { orders } from "./orders";
import { mealPlan } from "./meal-plan";

/**
 * Every mutation / authenticated read is namespaced here. Callers import from
 * `astro:actions` and hit `actions.recipes.create(...)` etc.
 *
 * Deferred namespaces (landing in their feature phase):
 *   - parse, import, enhance, ingredient-mapping  → Phase 7 (import pipeline)
 *   - estimate                                    → Phase 9 (cost)
 *   - profile                                     → Phase 11 (profile + reset)
 */
export const server = {
  tags,
  ingredients,
  recipes,
  recipeIngredients,
  orders,
  mealPlan,
};
