import { Suspense } from "react";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getRecipeWithIngredientsForUser,
  recordRecipeView,
  serializeRecipeForClient,
} from "@/lib/queries/recipes";
import { getWeekStartString } from "@/lib/meal-plan/week-dates";
import { RecipePageClient } from "@/components/recipes/recipe-page-client";
import { RecipeViewSkeleton } from "@/components/recipes/recipe-view-skeleton";
import { renderMarkdownToHtml } from "@/features/markdown/render-markdown";

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
  // Schedule view recording after response is sent (reliable in serverless vs fire-and-forget)
  after(async () => {
    await recordRecipeView(id, session.user.id).catch(() => {
      // Ignore errors so view recording never surfaces to the user
    });
  });
  const initialCookingView = cooking === "1";
  const recipeSerialized = serializeRecipeForClient(recipe);
  const weekStart = getWeekStartString(new Date());
  let notesHtml: string | null = null;
  if (recipe.notes?.trim()) {
    try {
      notesHtml = await renderMarkdownToHtml(recipe.notes.trim());
    } catch (err) {
      console.error("recipe notes markdown", err);
    }
  }
  return (
    <RecipePageClient
      recipe={recipeSerialized}
      initialCookingView={initialCookingView}
      weekStart={weekStart}
      notesHtml={notesHtml}
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
