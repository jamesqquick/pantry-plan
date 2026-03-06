import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRecipeWithIngredientsForUser } from "@/lib/queries/recipes";
import { RecipeView } from "@/components/recipes/recipe-view";
import { RecipeViewSkeleton } from "@/components/recipes/recipe-view-skeleton";
import { CookingViewToggle } from "@/components/recipes/cooking-view-toggle";

async function RecipePageData({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cooking?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id } = await params;
  const { cooking } = await searchParams;
  const recipe = await getRecipeWithIngredientsForUser(id, session.user.id);
  if (!recipe) notFound();
  const cookingView = cooking === "1";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/recipes"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← My recipes
        </Link>
        <CookingViewToggle recipeId={recipe.id} isCookingView={cookingView} />
      </div>
      <RecipeView recipe={recipe} cookingView={cookingView} />
    </div>
  );
}

export default function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cooking?: string }>;
}) {
  return (
    <Suspense fallback={<RecipeViewSkeleton />}>
      <RecipePageData params={params} searchParams={searchParams} />
    </Suspense>
  );
}
