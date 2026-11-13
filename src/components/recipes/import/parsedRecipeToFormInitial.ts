import type { ParsedRecipeDraft } from "@/actions/parse";
import type { RecipeFormInitial, RecipeIngredientDraft } from "@/components/recipes/RecipeForm";
import { parseScalableIngredientLine } from "@/lib/ingredients/parse-ingredient-line-structured";
import { formatQuantityForInput } from "@/lib/quantity/quantity";

export function parsedRecipeToFormInitial(draft: ParsedRecipeDraft): RecipeFormInitial {
  const ingredients: RecipeIngredientDraft[] = draft.ingredients.flatMap((line, index) => {
    if (!line.trim()) return [];
    const parsed = parseScalableIngredientLine(line);
    const suggestion = draft.ingredientLines?.[index];
    const matchingSuggestion = suggestion?.raw === line.trim() ? suggestion : null;
    const createIngredientName = matchingSuggestion?.createName?.trim() || null;

    return [{
      rawText: line,
      displayText: parsed.displayText,
      quantityText: parsed.kind === "scalable" ? formatQuantityForInput(parsed.quantity) : "",
      unit: parsed.kind === "scalable" ? parsed.unit : "",
      ingredientId: matchingSuggestion?.ingredientId && matchingSuggestion.ingredientName
        ? matchingSuggestion.ingredientId
        : null,
      ingredientName: matchingSuggestion?.ingredientName ?? createIngredientName,
      createIngredientName: matchingSuggestion?.ingredientId ? null : createIngredientName,
    }];
  });

  return {
    title: draft.title,
    sourceUrl: draft.sourceUrl,
    imageUrl: draft.imageUrl ?? "",
    servings: draft.servings?.toString() ?? "",
    prepTimeMinutes: draft.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: draft.cookTimeMinutes?.toString() ?? "",
    totalTimeMinutes: draft.totalTimeMinutes?.toString() ?? "",
    notes: draft.notes ?? "",
    instructions: draft.instructions,
    ingredients,
    tagIds: [],
  };
}
