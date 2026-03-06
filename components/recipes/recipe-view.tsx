import React from "react";
import Link from "next/link";
import type { IngredientUnit } from "@/generated/prisma/client";
import { PageTitle } from "@/components/ui/page-title";
import { AppIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { NumberedList } from "@/components/ui/numbered-list";
import { DeleteRecipeButton } from "@/components/recipes/delete-recipe-button";
import { DuplicateRecipeButton } from "@/components/recipes/duplicate-recipe-button";
import { formatIngredientLine } from "@/lib/ingredientLineFormat";
import { UNIT_LABELS } from "@/lib/ingredients/units";

type RecipeIngredientItem = {
  id: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
  originalQuantity: number | null;
  originalUnit: IngredientUnit | null;
  weightGrams: number | null;
  conversionSource: string | null;
  conversionConfidence: string | null;
  ingredient: {
    id: string;
    name: string;
    defaultUnit: IngredientUnit | null;
  } | null;
};

type Recipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  recipeInstructions?: { text: string }[];
  notes: string | null;
  recipeTags?: { tag: { id: string; name: string } }[];
  recipeIngredients?: RecipeIngredientItem[];
};

function needsAttention(ri: {
  ingredient?: { id: string; name: string } | null;
  quantity?: number | null;
  unit?: unknown;
}): boolean {
  const ing = ri?.ingredient;
  const qty = ri.quantity;
  const unit = ri.unit;
  return !ing || qty == null || unit == null;
}

export function RecipeView({
  recipe,
  cookingView = false,
}: {
  recipe: Recipe;
  cookingView?: boolean;
}) {
  const ingredients = recipe.recipeIngredients ?? [];
  const ingredientsEnhanced = ingredients.some(
    (ri) =>
      ri.ingredient != null || ri.quantity != null || ri.unit != null
  );
  const needAttentionCount = ingredients.filter(needsAttention).length;
  const structured = ingredients.map((ri) => {
    const ingredient = ri.ingredient ?? undefined;
    const unitLabel = ri.unit != null ? UNIT_LABELS[ri.unit] : null;
    const displayLine = formatIngredientLine({
      quantity: ri.quantity ?? null,
      unit: unitLabel,
      nameNormalized: null,
      ingredientName: ri.displayText || "—",
    });
    return {
      id: ri.id,
      displayText: ri.displayText,
      displayLine,
      ingredient: ingredient
        ? { id: ingredient.id, name: ingredient.name }
        : undefined,
    };
  });
  const instructions = recipe.recipeInstructions?.map((i) => i.text) ?? [];
  const ingredientLines = structured.map(
    (s) => s.displayLine?.trim() || s.displayText?.trim() || "—"
  );

  const metaItems: {
    icon: "chef-hat" | "flame" | "clock" | "users";
    label: string;
    value: string;
  }[] = [];
  if (recipe.servings != null)
    metaItems.push({
      icon: "users",
      label: "Servings",
      value: String(recipe.servings),
    });
  if (recipe.prepTimeMinutes != null)
    metaItems.push({
      icon: "chef-hat",
      label: "Prep Time",
      value: `${recipe.prepTimeMinutes} min`,
    });
  if (recipe.cookTimeMinutes != null)
    metaItems.push({
      icon: "flame",
      label: "Cook Time",
      value: `${recipe.cookTimeMinutes} min`,
    });
  if (recipe.totalTimeMinutes != null)
    metaItems.push({
      icon: "clock",
      label: "Total Time",
      value: `${recipe.totalTimeMinutes} min`,
    });

  if (cookingView) {
    return (
      <article className="space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">{recipe.title}</h1>
        <Card>
          <CardContent>
            <section>
              <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
                Ingredients
              </h2>
              <NumberedList items={ingredientLines} />
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <section>
              <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
                Instructions
              </h2>
              <NumberedList items={instructions} />
            </section>
          </CardContent>
        </Card>
      </article>
    );
  }

  return (
    <article className="space-y-6">
      {recipe.imageUrl && (
        <div className="aspect-16/10 w-full max-h-[400px] overflow-hidden rounded-input bg-accent sm:mx-auto sm:max-w-2xl">
          <img
            src={recipe.imageUrl}
            alt=""
            className="h-full w-full object-contain object-center"
          />
        </div>
      )}
      {needAttentionCount > 0 && (
        <div className="rounded-input border border-amber-200/60 bg-amber-50/30 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/20">
          <p className="text-foreground">
            ⚡ Enhance ingredient data to unlock scaling, cost tracking, and smart planning.{" "}
            <Link
              href={`/recipes/${recipe.id}/edit`}
              className="font-medium text-primary hover:underline"
            >
              Update recipe →
            </Link>
          </p>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PageTitle>{recipe.title}</PageTitle>
          {recipe.recipeTags && recipe.recipeTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {recipe.recipeTags.map((rt) => (
                <span
                  key={rt.tag.id}
                  className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                >
                  {rt.tag.name}
                </span>
              ))}
            </div>
          )}
          {recipe.sourceUrl && (
            <p className="mt-1 text-sm">
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground underline hover:text-foreground"
              >
                Source
              </a>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <Link
            href={`/recipes/${recipe.id}/edit`}
            aria-label="Edit recipe"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-input border border-input bg-secondary p-2 text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AppIcon name="edit" size={18} aria-hidden />
          </Link>
          <DuplicateRecipeButton recipeId={recipe.id} />
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>
      {metaItems.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
              Recipe Metadata
            </h2>
            <ul
              className="grid grid-cols-1 gap-x-6 gap-y-4 min-[480px]:grid-cols-2 md:grid-cols-4"
              aria-label="Recipe details"
            >
              {metaItems.map((item) => (
                <li
                  key={`${item.icon}-${item.label}`}
                  className="flex items-center gap-3"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-muted text-foreground"
                    aria-hidden
                  >
                    <AppIcon name={item.icon} size={20} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-col justify-center">
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.label}
                    </span>
                    <span className="text-base font-semibold text-foreground">
                      {item.value}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent>
          <section aria-label="Ingredients with catalog mapping">
            <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
              Ingredients
            </h2>
            <ol
              className="mt-2 list-none space-y-4 pl-0 text-foreground"
              role="list"
            >
              {structured.map((item, i) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 gap-y-1"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.displayLine?.trim() ||
                      item.displayText?.trim() ||
                      "—"}
                  </span>
                  <span className="w-full shrink-0 sm:w-auto">
                    {item.ingredient ? (
                      <Link
                        href={`/ingredients/${item.ingredient.id}`}
                        className="inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-normal text-accent-foreground hover:underline"
                      >
                        {item.ingredient.name}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not mapped
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {!ingredientsEnhanced && (
              <div className="mt-6 flex flex-col gap-4 sm:items-end">
                <Callout
                  variant="info"
                  className="w-full text-center text-info"
                >
                  Enhancing ingredients maps them to your catalog which enables
                  recipe scaling, cost tracking, and smart planning. It&apos;s
                  one extra step, but it enables lots of functionality.
                </Callout>
                <Button asChild variant="default" className="w-full sm:w-auto">
                  <Link href={`/recipes/${recipe.id}/enhance`}>
                    Enhance ingredients
                  </Link>
                </Button>
              </div>
            )}
          </section>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <section>
            <h2 className="text-lg font-medium text-foreground border-b border-border pt-4 pb-4 mb-6">
              Instructions
            </h2>
            <NumberedList items={instructions} />
          </section>
        </CardContent>
      </Card>
      {recipe.notes && (
        <section>
          <h2 className="text-lg font-medium text-foreground">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-foreground">
            {recipe.notes}
          </p>
        </section>
      )}
    </article>
  );
}
