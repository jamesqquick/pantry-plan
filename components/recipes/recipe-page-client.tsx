"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RecipeView } from "@/components/recipes/recipe-view";
import { CookingViewToggle } from "@/components/recipes/cooking-view-toggle";
import { cn } from "@/lib/utils";
import type { RecipeWithIngredientsSerialized } from "@/lib/queries/recipes";

export type RecipeScale = 1 | 2 | 3;

const SCALE_OPTIONS: { value: RecipeScale; label: string }[] = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
];

export function RecipePageClient({
  recipe,
  initialCookingView,
  weekStart,
}: {
  recipe: RecipeWithIngredientsSerialized;
  initialCookingView: boolean;
  weekStart: string;
}) {
  const [cookingView, setCookingView] = useState(initialCookingView);
  const [scale, setScale] = useState<RecipeScale>(1);

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
        <Link
          href={`/meal-plan/${weekStart}?addRecipe=${recipe.id}`}
          className="inline-flex items-center gap-1.5 rounded-input border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Add to meal plan
        </Link>
        <CookingViewToggle
          recipeId={recipe.id}
          isCookingView={cookingView}
          onToggle={() => setCookingView((prev) => !prev)}
        />
        <div
          className="inline-flex rounded-input border border-border bg-background p-0.5 text-sm"
          role="group"
          aria-label="Scale recipe"
        >
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScale(opt.value)}
              className={cn(
                "rounded-input px-3 py-1.5 font-medium transition-colors",
                scale === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
              )}
              aria-pressed={scale === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <RecipeView recipe={recipe} cookingView={cookingView} scale={scale} />
    </div>
  );
}
