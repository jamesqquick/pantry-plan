import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getIngredient } from "@/lib/queries/ingredients";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { UNIT_LABELS } from "@/lib/ingredients/units";
import { DeleteIngredientButton } from "@/components/ingredients/delete-ingredient-button";
import { IngredientViewSkeleton } from "@/components/ingredients/ingredient-view-skeleton";
import type {
  CostBasisUnit,
  IngredientDisplayUnit,
  IngredientUnit,
} from "@/generated/prisma/client";

const COST_BASIS_LABELS: Record<CostBasisUnit, string> = {
  GRAM: "gram",
  CUP: "cup",
  EACH: "each",
};

const DISPLAY_UNIT_LABELS: Record<IngredientDisplayUnit, string> = {
  AUTO: "Auto",
  GRAM: "Gram",
  CUP: "Cup",
  EACH: "Each",
  TBSP: "Tablespoon",
  TSP: "Teaspoon",
};

/* Recipe metadata pattern: label smaller/muted, value larger/semibold */
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";
const valueClass = "text-base font-semibold text-foreground";
const valueEmptyClass = "text-base text-muted-foreground";

async function IngredientViewData({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const ingredient = await getIngredient(id);
  if (!ingredient) notFound();
  const isGlobal = ingredient.userId === null;
  const canView = isGlobal || ingredient.userId === session.user.id;
  if (!canView) notFound();
  const canEdit =
    (isGlobal && session.user.role === "ADMIN") ||
    (!isGlobal && ingredient.userId === session.user.id);

  const gramsPerCup =
    ingredient.gramsPerCup != null ? Number(ingredient.gramsPerCup) : null;

  const costValue =
    ingredient.estimatedCentsPerBasisUnit != null
      ? `${ingredient.estimatedCentsPerBasisUnit}¢ per ${COST_BASIS_LABELS[ingredient.costBasisUnit as CostBasisUnit]}`
      : null;
  const notesValue = ingredient.notes?.trim() || null;

  return (
    <div className="space-y-6">
      <Link
        href="/ingredients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-input"
      >
        <AppIcon name="back" size={16} aria-hidden />
        Back to ingredients
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle>{ingredient.name}</PageTitle>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
            aria-label={isGlobal ? "Global ingredient" : "Custom ingredient"}
          >
            {isGlobal ? "Global" : "Custom"}
          </span>
        </div>
        {canEdit && (
          <Button asChild variant="secondary" className={ICON_LABEL_GAP_CLASS}>
            <Link href={`/ingredients/${id}/edit`}>
              <AppIcon name="edit" size={18} aria-hidden />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingredient details</CardTitle>
        </CardHeader>
        <CardContent>
          {!isGlobal && ingredient.baseIngredientId && ingredient.baseIngredient && (
            <div className="mb-4 rounded-input border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              <span className="text-muted-foreground">Based on global: </span>
              <Link
                href={`/ingredients/${ingredient.baseIngredient.id}`}
                className="font-medium underline hover:no-underline"
              >
                {ingredient.baseIngredient.name}
              </Link>
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="border-b border-border pb-3">
              <span className={labelClass}>Name</span>
              <p className={valueClass}>{ingredient.name}</p>
            </div>
            {ingredient.category && (
              <div className="border-b border-border pb-3">
                <span className={labelClass}>Category</span>
                <p className={valueClass}>{ingredient.category}</p>
              </div>
            )}
            {ingredient.defaultUnit != null && (
              <div className="border-b border-border pb-3">
                <span className={labelClass}>Default unit</span>
                <p className={valueClass}>
                  {UNIT_LABELS[ingredient.defaultUnit as IngredientUnit]}
                </p>
              </div>
            )}
            <div className="border-b border-border pb-3">
              <span className={labelClass}>Cost basis unit</span>
              <p className={valueClass}>
                {COST_BASIS_LABELS[ingredient.costBasisUnit as CostBasisUnit]}
              </p>
            </div>
            <div className="border-b border-border pb-3">
              <span className={labelClass}>
                Estimated cost (cents per basis unit)
              </span>
              <p
                className={costValue ? valueClass : valueEmptyClass}
              >
                {costValue ?? "—"}
              </p>
            </div>
            {gramsPerCup != null && (
              <div className="border-b border-border pb-3">
                <span className={labelClass}>Grams per cup</span>
                <p className={valueClass}>{gramsPerCup}</p>
              </div>
            )}
            <div className="border-b border-border pb-3 sm:col-span-2">
              <span className={labelClass}>Notes</span>
              <p
                className={`whitespace-pre-wrap ${
                  notesValue ? valueClass : valueEmptyClass
                }`}
              >
                {notesValue ?? "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grocery list display</CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            How this ingredient appears on order grocery lists (Shopper mode).
            Cost is always calculated from the cost basis unit.
          </p>
        </CardHeader>
        <CardContent>
          <div className="border-b border-border pb-3">
            <span className={labelClass}>Preferred display unit</span>
            <p className={valueClass}>
              {DISPLAY_UNIT_LABELS[ingredient.preferredDisplayUnit as IngredientDisplayUnit]}
            </p>
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="pt-6 border-t border-border">
          <DeleteIngredientButton ingredientId={id} />
        </div>
      )}
    </div>
  );
}

export default function IngredientViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<IngredientViewSkeleton />}>
      <IngredientViewData params={params} />
    </Suspense>
  );
}
