import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getRecipeWithIngredientsForUser,
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
