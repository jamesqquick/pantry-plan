import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRecipeForUser } from "@/lib/queries/recipes";
import { PageTitle } from "@/components/ui/page-title";
import { EnhanceRecipeClient } from "./EnhanceRecipeClient";

export default async function EnhanceRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const recipe = await getRecipeForUser(id, session.user.id);
  if (!recipe) notFound();
  const hasIngredients =
    recipe.recipeIngredients &&
    recipe.recipeIngredients.length > 0 &&
    recipe.recipeIngredients.some(
      (ri) => (ri.rawText ?? ri.displayText ?? "").trim()
    );
  if (!hasIngredients) notFound();
  return (
    <div className="space-y-6">
      <Link
        href={`/recipes/${id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to recipe
      </Link>
      <PageTitle>Enhance Recipe Ingredients</PageTitle>
      <p className="text-sm text-muted-foreground">
        Enhancing ingredients for: {recipe.title}
      </p>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <p className="mb-2">
          <strong className="font-medium text-foreground">What enhancing does</strong>
        </p>
        <p className="mb-2">
          Each original raw ingredient line is parsed into individual fields:{" "}
          <strong className="text-foreground">quantity</strong>,{" "}
          <strong className="text-foreground">unit</strong>, and{" "}
          <strong className="text-foreground">display text</strong>. The system
          then attempts to map each ingredient to a base ingredient from your
          catalog.
        </p>
        <p className="mb-0">
          Base ingredients provide the data needed for unit conversions,
          summing ingredients across recipes, and cost estimates. Review and
          correct any mappings below before saving.
        </p>
      </div>
      <EnhanceRecipeClient recipeId={recipe.id} recipeTitle={recipe.title} />
    </div>
  );
}
