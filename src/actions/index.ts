import { tags } from "./tags";
import { ingredients } from "./ingredients";
import { recipes } from "./recipes";
import { recipeIngredients } from "./recipe-ingredients";
import { orders } from "./orders";
import { mealPlan } from "./meal-plan";
import { parse } from "./parse";
import { recipeImport } from "./import";
import { ingredientMapping } from "./ingredient-mapping";
import { profile } from "./profile";
import { mcpKeys } from "./mcp-keys";
import { searchIndex } from "./search-index";

/**
 * Every mutation / authenticated read is namespaced here. Callers import from
 * `astro:actions` and hit `actions.recipes.create(...)` etc.
 */
export const server = {
  tags,
  ingredients,
  recipes,
  recipeIngredients,
  orders,
  mealPlan,
  parse,
  recipeImport: {
    saveTextOnly: recipeImport.saveTextOnly,
  },
  ingredientMapping,
  profile,
  mcpKeys,
  searchIndex,
};
