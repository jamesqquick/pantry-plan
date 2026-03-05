import {
  RecipeIngredientList,
  type RecipeIngredientForList,
} from "./ingredient-list";

export function RecipeIngredientsSection({
  recipeId,
  recipeIngredients,
  rawIngredients,
}: {
  recipeId: string;
  recipeIngredients: Array<RecipeIngredientForList & { source?: "base" | "override" | "add" }>;
  rawIngredients: string[];
}) {
  return (
    <section>
      <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
        Ingredients
      </h2>
      <RecipeIngredientList
        recipeId={recipeId}
        recipeIngredients={recipeIngredients}
        rawIngredients={rawIngredients}
      />
    </section>
  );
}
