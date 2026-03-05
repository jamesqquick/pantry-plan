import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRecipeForUser } from "@/lib/queries/recipes";
import { listTagsForUser } from "@/lib/queries/tags";
import { RecipeForm } from "@/components/forms/recipe-form";

async function EditRecipePageData({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const [recipe, allTags] = await Promise.all([
    getRecipeForUser(id, session.user.id),
    listTagsForUser(session.user.id),
  ]);

  if (!recipe) notFound();
  const ingredients = recipe.recipeIngredients.map((ri) => ri.displayText);
  const instructions = (recipe.recipeInstructions ?? []).map((i) => i.text);
  const isEnhanced = recipe.recipeIngredients.some(
    (ri) => ri.ingredientId != null || ri.quantity != null || ri.unit != null
  );
  const structuredItems = recipe.recipeIngredients.map((ri) => ({
    ingredientId: ri.ingredientId ?? "",
    ingredientName: ri.ingredient?.name ?? "",
    quantity: ri.quantity ?? undefined,
    unit: ri.unit ?? undefined,
    displayText: ri.displayText,
    rawText: ri.rawText ?? undefined,
    sortOrder: ri.sortOrder,
  }));
  const initialTagIds = (recipe.recipeTags ?? []).map((rt) => rt.tag.id);
  return (
    <div className="space-y-8">
      <Link
        href={`/recipes/${id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to recipe
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Edit Recipe
      </h1>
      <RecipeForm
        mode="edit"
        recipeId={id}
        initialValues={{
          title: recipe.title,
          sourceUrl: recipe.sourceUrl ?? undefined,
          imageUrl: recipe.imageUrl ?? undefined,
          servings: recipe.servings ?? undefined,
          prepTimeMinutes: recipe.prepTimeMinutes ?? undefined,
          cookTimeMinutes: recipe.cookTimeMinutes ?? undefined,
          totalTimeMinutes: recipe.totalTimeMinutes ?? undefined,
          ingredients,
          instructions,
          notes: recipe.notes ?? undefined,
        }}
        initialStructuredItems={isEnhanced ? structuredItems : undefined}
        ingredientsCatalog={isEnhanced ? [] : undefined}
        ingredientsEnhanced={isEnhanced}
        preserveDisplayText={!!recipe.sourceUrl}
        existingTags={allTags}
        initialTagIds={initialTagIds}
      />
    </div>
  );
}

export default function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <EditRecipePageData params={params} />
    </Suspense>
  );
}
