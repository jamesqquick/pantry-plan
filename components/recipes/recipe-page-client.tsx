"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RecipeView } from "@/components/recipes/recipe-view";
import { CookingViewToggle } from "@/components/recipes/cooking-view-toggle";
import type { RecipeWithIngredientsSerialized } from "@/lib/queries/recipes";

export function RecipePageClient({
  recipe,
  initialCookingView,
}: {
  recipe: RecipeWithIngredientsSerialized;
  initialCookingView: boolean;
}) {
  const [cookingView, setCookingView] = useState(initialCookingView);

  useEffect(() => {
    setCookingView(initialCookingView);
  }, [initialCookingView]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/recipes"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← My recipes
        </Link>
        <CookingViewToggle
          recipeId={recipe.id}
          isCookingView={cookingView}
          onToggle={() => setCookingView((prev) => !prev)}
        />
      </div>
      <RecipeView recipe={recipe} cookingView={cookingView} />
    </div>
  );
}
