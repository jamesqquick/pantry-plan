import { Suspense } from "react";
import type { CostBasisUnit, IngredientUnit } from "@/generated/prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrderWithGroceryData } from "@/lib/queries/orders";
import { getRecipesWithIngredientsForUser } from "@/lib/queries/recipes";
import { buildGroceryList } from "@/lib/grocery/aggregate";
import { toDisplayUnits, formatCanonicalForKitchen } from "@/lib/grocery/display-units";
import type { CanonicalUnit, CanonicalUnitLabel } from "@/lib/grocery/display-units";
import { type GroceryLine } from "@/lib/grocery/format";
import { PageTitle } from "@/components/ui/page-title";
import { GroceryActions } from "@/components/grocery/grocery-actions";
import { GroceryListDisplay } from "@/components/orders/grocery-list-display";

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

async function OrderDetailPageData({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const order = await getOrderWithGroceryData(id, session.user.id);
  if (!order) notFound();

  const orderItems = order.orderItems.map((item) => ({
    recipeId: item.recipeId,
    batches: item.batches,
  }));
  const recipeIds = [...new Set(order.orderItems.map((i) => i.recipeId))];
  const recipesWithIngredients = await getRecipesWithIngredientsForUser(
    recipeIds,
    session.user.id
  );
  const recipes = recipesWithIngredients.map((r) => ({
    id: r.id,
    title: r.title,
    ingredients: r.recipeIngredients.map((ri) => ({
      id: ri.id,
      ingredientId: ri.ingredientId,
      ingredient: ri.ingredient
        ? {
            id: ri.ingredient.id,
            name: ri.ingredient.name,
            costBasisUnit: ri.ingredient.costBasisUnit ?? "GRAM",
            estimatedCentsPerBasisUnit: ri.ingredient.estimatedCentsPerBasisUnit ?? null,
            gramsPerCup: ri.ingredient.gramsPerCup ?? null,
            cupsPerEach: ri.ingredient.cupsPerEach ?? null,
            preferredDisplayUnit: ri.ingredient.preferredDisplayUnit ?? "AUTO",
          }
        : null,
      quantity: ri.quantity,
      unit: ri.unit as IngredientUnit | null,
      displayText: ri.displayText,
    })),
  }));

  const grocery =
    orderItems.length > 0 && recipes.length > 0
      ? buildGroceryList({ orderItems, recipes })
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/orders"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Orders
      </Link>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PageTitle>{order.name?.trim() || "Untitled order"}</PageTitle>
          {order.notes && (
            <p className="mt-1 text-muted-foreground">{order.notes}</p>
          )}
        </div>
        <Link
          href={`/orders/${order.id}/edit`}
          className="shrink-0 rounded-input border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Edit order
        </Link>
      </div>
      <section>
        <h2 className="text-lg font-medium text-foreground">
          Items
        </h2>
        {order.orderItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No items yet.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse border border-border">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-3 py-2 text-left text-sm font-medium">
                  Recipe
                </th>
                <th className="border border-border px-3 py-2 text-left text-sm font-medium">
                  Batches
                </th>
              </tr>
            </thead>
            <tbody>
              {order.orderItems.map((item) => (
                <tr key={item.id}>
                  <td className="border border-border px-3 py-2">
                    {item.recipe?.title ?? "—"}
                  </td>
                  <td className="border border-border px-3 py-2">
                    {item.batches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {grocery && (
        <>
          <GroceryListDisplay
            totals={grocery.totals.map((t) => ({
              ingredientId: t.ingredientId,
              name: t.name,
              basisUnit: t.basisUnit,
              basisUnitLabel: t.basisUnitLabel as CanonicalUnitLabel,
              totalBasisQty: t.totalBasisQty,
              estimatedCostCents: t.estimatedCostCents,
              anyOptional: t.anyOptional,
              preferredDisplayUnit: t.preferredDisplayUnit,
              gramsPerCup: t.gramsPerCup != null ? Number(t.gramsPerCup) : null,
              sources: t.sources.map((s) => ({
                qty: s.qty,
                unit: s.unit,
                batches: s.batches,
              })),
            }))}
            title="Grocery list"
            actions={
              grocery.totals.length > 0 ? (
                <GroceryActions
                  lines={grocery.totals.map((t): GroceryLine => {
                    const canonicalUnit: CanonicalUnit =
                      t.basisUnit === "CUP" ? "CUP" : t.basisUnit === "EACH" ? "EACH" : "GRAM";
                    const display = toDisplayUnits({
                      canonicalQty: t.totalBasisQty,
                      canonicalUnit,
                      ingredient: {
                        preferredDisplayUnit: t.preferredDisplayUnit as import("@/lib/grocery/display-units").DisplayPreference,
                        gramsPerCup: t.gramsPerCup,
                      },
                    });
                    return {
                      name: t.name,
                      totalText: display.displayText,
                      optional: t.anyOptional,
                    };
                  })}
                  title="Grocery List"
                />
              ) : undefined
            }
          />
          <section>
            <h2 className="text-lg font-medium text-foreground">
              Estimated cost
            </h2>
            <p className="mt-2 text-lg font-medium text-foreground">
              {formatDollars(grocery.totalEstimatedCostCents)}
            </p>
            {grocery.issues.unmapped.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Total cost (excludes {grocery.issues.unmapped.length} unmapped
                ingredient{grocery.issues.unmapped.length !== 1 ? "s" : ""}).
                Map ingredients in each recipe to include them.
              </p>
            )}
          </section>
          {(grocery.issues.unmapped.length > 0 ||
            grocery.issues.missingQuantityOrUnit.length > 0 ||
            grocery.issues.cannotConvert.length > 0 ||
            grocery.issues.missingCost.length > 0) && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium text-foreground">
                Issues
              </h2>
              {grocery.issues.unmapped.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Not included in cost calculation
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Map these to a base ingredient in the recipe to enable cost
                    tracking.
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {grocery.issues.unmapped.map((u, i) => (
                      <li key={i}>
                        {u.recipeTitle}: {u.displayText}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {grocery.issues.missingQuantityOrUnit.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Missing quantity or unit
                  </h3>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {grocery.issues.missingQuantityOrUnit.map((m, i) => (
                      <li key={i}>
                        {m.recipeTitle}: {m.displayText}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {grocery.issues.cannotConvert.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Cannot convert to basis unit
                  </h3>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {grocery.issues.cannotConvert.map((c, i) => (
                      <li key={i}>
                        {c.recipeTitle}
                        {c.ingredientName != null ? ` (${c.ingredientName})` : ""}:{" "}
                        {c.displayText} — {c.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {grocery.issues.missingCost.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    Missing cost estimates
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set cost per basis unit in Ingredients for these items.
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {grocery.issues.missingCost.map((m) => (
                      <li key={m.ingredientId}>{m.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading order…</div>}>
      <OrderDetailPageData params={params} />
    </Suspense>
  );
}
