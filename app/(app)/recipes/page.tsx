import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { listTagsForUser } from "@/lib/queries/tags";
import {
  RecipeListWrapper,
  RecipeListContent,
  RecipeListSearch,
  RecipeListSortAndTags,
} from "@/components/recipes/recipe-list-client";
import {
  RecipeListGridSkeleton,
  ToolbarDropdownsSkeleton,
} from "@/components/recipes/recipe-list-skeleton";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";

async function RecipeListSortAndTagsAsync({
  currentTagId,
}: {
  currentTagId: string | null;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const allTags = await listTagsForUser(session.user.id);
  return (
    <RecipeListSortAndTags tags={allTags} currentTagId={currentTagId} />
  );
}

async function RecipesListData({
  searchParams,
}: {
  searchParams: Promise<{ tagId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const db = getDb();
  const { tagId } = await searchParams;
  const where = {
    userId: session.user.id,
    ...(tagId && tagId.trim()
      ? { recipeTags: { some: { tagId: tagId.trim() } } }
      : {}),
  };
  const recipes = await db.recipe.findMany({
    where,
    orderBy: [{ lastViewedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      imageUrl: true,
      servings: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
      totalTimeMinutes: true,
      lastViewedAt: true,
      createdAt: true,
      updatedAt: true,
      recipeTags: {
        select: { tag: { select: { id: true, name: true } } },
      },
    },
  });
  type RecipeRow = (typeof recipes)[number];
  type RecipeTagRow = RecipeRow["recipeTags"][number];
  const initialRecipes = recipes.map((r: RecipeRow) => ({
    id: r.id,
    title: r.title,
    sourceUrl: r.sourceUrl,
    imageUrl: r.imageUrl,
    servings: r.servings,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    totalTimeMinutes: r.totalTimeMinutes,
    lastViewedAt: r.lastViewedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tags: r.recipeTags.map((rt: RecipeTagRow) => rt.tag),
  }));
  return <RecipeListContent initialRecipes={initialRecipes} />;
}

async function RecipesPageContent({
  searchParams,
}: {
  searchParams: Promise<{ tagId?: string }>;
}) {
  const { tagId } = await searchParams;
  const currentTagId = tagId?.trim() ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle>My recipes</PageTitle>
        <Link href="/recipes/new">
          <Button size="lg" className={ICON_LABEL_GAP_CLASS}>
            <AppIcon name="add" size={18} aria-hidden />
            Add
          </Button>
        </Link>
      </div>
      <RecipeListWrapper
        toolbarSlot={
          <>
            <RecipeListSearch />
            <Suspense fallback={<ToolbarDropdownsSkeleton />}>
              <RecipeListSortAndTagsAsync currentTagId={currentTagId} />
            </Suspense>
          </>
        }
        tagsSlot={null}
        listSlot={
          <Suspense fallback={<RecipeListGridSkeleton />}>
            <RecipesListData searchParams={searchParams} />
          </Suspense>
        }
      />
    </div>
  );
}

export default function RecipesListPage({
  searchParams,
}: {
  searchParams: Promise<{ tagId?: string }>;
}) {
  return (
    <Suspense fallback={<RecipeListGridSkeleton />}>
      <RecipesPageContent searchParams={searchParams} />
    </Suspense>
  );
}
