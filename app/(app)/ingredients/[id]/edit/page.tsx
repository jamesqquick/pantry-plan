import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getIngredient } from "@/lib/queries/ingredients";
import { getIngredientCategoryOptions } from "@/lib/ingredients/category-options";
import { PageTitle } from "@/components/ui/page-title";
import { IngredientForm } from "@/components/ingredients/ingredient-form";
import { DeleteIngredientButton } from "@/components/ingredients/delete-ingredient-button";
import { IngredientEditSkeleton } from "@/components/ingredients/ingredient-edit-skeleton";

async function EditIngredientPageData({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const [ingredient, categoryOptions] = await Promise.all([
    getIngredient(id),
    getIngredientCategoryOptions(),
  ]);
  if (!ingredient) notFound();
  const isGlobal = ingredient.userId === null;
  const canEdit =
    (isGlobal && session.user.role === "ADMIN") ||
    (!isGlobal && ingredient.userId === session.user.id);
  if (!canEdit) redirect("/ingredients");
  return (
    <div className="space-y-6">
      <Link
        href={`/ingredients/${id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ingredient
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle>Edit ingredient</PageTitle>
        <span
          className="rounded-full bg-accent px-2 py-0.5 text-sm text-accent-foreground"
          aria-label={isGlobal ? "Global ingredient" : "Custom ingredient"}
        >
          {isGlobal ? "Global" : "Custom"}
        </span>
      </div>
      {ingredient.userId != null && ingredient.baseIngredientId && ingredient.baseIngredient && (
        <p className="text-sm text-muted-foreground">
          Based on global ingredient:{" "}
          <Link
            href={`/ingredients/${ingredient.baseIngredient.id}`}
            className="font-medium text-foreground underline hover:no-underline"
          >
            {ingredient.baseIngredient.name}
          </Link>
        </p>
      )}
      <IngredientForm
        mode="edit"
        ingredientId={id}
        initialPreferredDisplayUnit={ingredient.preferredDisplayUnit}
        categories={categoryOptions.categories}
        initialValues={{
          name: ingredient.name,
          category: ingredient.category ?? undefined,
          defaultUnit: ingredient.defaultUnit ?? undefined,
          costBasisUnit: ingredient.costBasisUnit,
          estimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit ?? undefined,
          notes: ingredient.notes ?? undefined,
        }}
      />
      <DeleteIngredientButton ingredientId={id} />
    </div>
  );
}

export default function EditIngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<IngredientEditSkeleton />}>
      <EditIngredientPageData params={params} />
    </Suspense>
  );
}
