import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getRecipeWithIngredientsForUser,
  recordRecipeView,
  serializeRecipeForClient,
} from "@/lib/queries/recipes";
import { RecipePageClient } from "@/components/recipes/recipe-page-client";
import { RecipeViewSkeleton } from "@/components/recipes/recipe-view-skeleton";

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
  // Non-blocking: record view for "recently viewed" sort without delaying the response
  void recordRecipeView(id, session.user.id).catch(() => {
    // Ignore errors so view recording never blocks or surfaces to the user
  });
  const initialCookingView = cooking === "1";
  const recipeSerialized = serializeRecipeForClient(recipe);
  return (
    <RecipePageClient
      recipe={recipeSerialized}
      initialCookingView={initialCookingView}
    />
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
