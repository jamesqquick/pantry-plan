"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Toast, type ToastVariant } from "@/components/ui/toast";
import {
  RecipeListRecipeCard,
  type RecipeListRecipe,
} from "@/components/recipes/recipe-list-recipe-card";

export function IngredientRecipesList({
  initialRecipes,
  ingredientName,
}: {
  initialRecipes: RecipeListRecipe[];
  ingredientName: string;
}) {
  const [recipes, setRecipes] = useState<RecipeListRecipe[]>(initialRecipes);
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const handleDelete = useCallback((id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant) => {
    setToast({ message, variant });
  }, []);

  return (
    <>
      {recipes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No recipes yet using <span className="font-medium text-foreground">{ingredientName}</span>.{" "}
          <Link href="/recipes/new" className="underline">
            Add one
          </Link>
          .
        </p>
      ) : (
        <ul
          className="mt-4 grid min-w-0 auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
        >
          {recipes.map((r) => (
            <li key={r.id} className="flex min-w-0">
              <RecipeListRecipeCard
                recipe={r}
                onDelete={handleDelete}
                onToast={showToast}
              />
            </li>
          ))}
        </ul>
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onOpenChange={(open) => {
            if (!open) setToast(null);
          }}
        />
      )}
    </>
  );
}

