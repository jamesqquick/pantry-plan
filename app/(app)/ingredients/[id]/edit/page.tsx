import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getIngredient } from "@/lib/queries/ingredients";
import { PageTitle } from "@/components/ui/page-title";
import { IngredientForm } from "@/components/ingredients/ingredient-form";
import { IngredientDisplayPreferenceForm } from "@/components/ingredients/ingredient-display-preference-form";
import { DeleteIngredientButton } from "@/components/ingredients/delete-ingredient-button";

async function EditIngredientPageData({
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
          aria-label={isGlobal ? "Global ingredient" : "User created"}
        >
          {isGlobal ? "Global" : "User created"}
        </span>
      </div>
      <IngredientForm
        mode="edit"
        ingredientId={id}
        initialValues={{
          name: ingredient.name,
          category: ingredient.category ?? undefined,
          defaultUnit: ingredient.defaultUnit ?? undefined,
          costBasisUnit: ingredient.costBasisUnit,
          estimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit ?? undefined,
          notes: ingredient.notes ?? undefined,
        }}
      />
      <IngredientDisplayPreferenceForm
        ingredientId={id}
        currentPreferredDisplayUnit={ingredient.preferredDisplayUnit ?? "AUTO"}
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
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading…</div>}>
      <EditIngredientPageData params={params} />
    </Suspense>
  );
}
