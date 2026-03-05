import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getIngredient } from "@/lib/queries/ingredients";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UNIT_LABELS } from "@/lib/ingredients/units";
import { DeleteIngredientButton } from "@/components/ingredients/delete-ingredient-button";
import type {
  CostBasisUnit,
  IngredientDisplayUnit,
  IngredientUnit,
} from "@prisma/client";

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

const labelClass = "mb-1 block text-sm font-medium text-foreground";
const valueClass = "text-sm text-foreground";

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

  return (
    <div className="space-y-6">
      <Link
        href="/ingredients"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ingredients
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle>{ingredient.name}</PageTitle>
          <span
            className="rounded-full bg-accent px-2 py-0.5 text-sm text-accent-foreground"
            aria-label={isGlobal ? "Global ingredient" : "User created"}
          >
            {isGlobal ? "Global" : "User created"}
          </span>
        </div>
        {canEdit && (
          <Button asChild variant="secondary">
            <Link href={`/ingredients/${id}/edit`}>Edit</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent>
          <div className="space-y-4">
            <div>
              <span className={labelClass}>Name</span>
              <p className={valueClass}>{ingredient.name}</p>
            </div>
            {ingredient.category && (
              <div>
                <span className={labelClass}>Category</span>
                <p className={valueClass}>
                  {ingredient.subcategory
                    ? `${ingredient.category} › ${ingredient.subcategory}`
                    : ingredient.category}
                </p>
              </div>
            )}
            {ingredient.defaultUnit != null && (
              <div>
                <span className={labelClass}>Default unit</span>
                <p className={valueClass}>
                  {UNIT_LABELS[ingredient.defaultUnit as IngredientUnit]}
                </p>
              </div>
            )}
            <div>
              <span className={labelClass}>Cost basis unit</span>
              <p className={valueClass}>
                {COST_BASIS_LABELS[ingredient.costBasisUnit]}
              </p>
            </div>
            <div>
              <span className={labelClass}>
                Estimated cost (cents per basis unit)
              </span>
              <p className={valueClass}>
                {ingredient.estimatedCentsPerBasisUnit != null
                  ? `${ingredient.estimatedCentsPerBasisUnit}¢ per ${COST_BASIS_LABELS[ingredient.costBasisUnit]}`
                  : "—"}
              </p>
            </div>
            {gramsPerCup != null && (
              <div>
                <span className={labelClass}>Grams per cup</span>
                <p className={valueClass}>{gramsPerCup}</p>
              </div>
            )}
            <div>
              <span className={labelClass}>Notes</span>
              <p className={`${valueClass} whitespace-pre-wrap`}>
                {ingredient.notes || "—"}
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
          <div>
            <span className={labelClass}>Preferred display unit</span>
            <p className={valueClass}>
              {DISPLAY_UNIT_LABELS[ingredient.preferredDisplayUnit]}
            </p>
          </div>
        </CardContent>
      </Card>

      {canEdit && <DeleteIngredientButton ingredientId={id} />}
    </div>
  );
}

function IngredientViewFallback() {
  return (
    <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
      Loading ingredient…
    </div>
  );
}

export default function IngredientViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<IngredientViewFallback />}>
      <IngredientViewData params={params} />
    </Suspense>
  );
}
