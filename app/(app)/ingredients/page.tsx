import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  listIngredientsForUser,
  countIngredientsForUser,
} from "@/lib/queries/ingredients";
import { getIngredientCategoryOptions } from "@/lib/ingredients/category-options";
import { PageTitle } from "@/components/ui/page-title";
import { IngredientList } from "@/components/ingredients/ingredient-list";
import { IngredientListSkeleton } from "@/components/ingredients/ingredient-list-skeleton";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 10;
const MAX_LIMIT = 100;

async function IngredientsPageData({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; page?: string; limit?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const search = params.search;
  const category = params.category;
  const pageRaw = params.page;
  const limitRaw = params.limit;

  const page = Math.max(
    1,
    typeof pageRaw === "string" && /^\d+$/.test(pageRaw)
      ? parseInt(pageRaw, 10)
      : 1
  );
  const limit = (() => {
    const n =
      typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? parseInt(limitRaw, 10)
        : DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
  })();

  const skip = (page - 1) * limit;

  const [categoryOptions, ingredients, totalCount] = await Promise.all([
    getIngredientCategoryOptions(),
    listIngredientsForUser(session.user.id, { search, category, skip, take: limit }),
    countIngredientsForUser(session.user.id, { search, category }),
  ]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const ingredientsPlain = ingredients.map((ing) => ({
    id: ing.id,
    name: ing.name,
    userId: ing.userId,
    category: ing.category,
  }));

  return (
    <IngredientList
      ingredients={ingredientsPlain}
      search={search}
      category={category}
      categories={categoryOptions.categories.map((c) => c.name)}
      totalCount={totalCount}
      page={page}
      limit={limit}
      totalPages={totalPages}
    />
  );
}

export default function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; page?: string; limit?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle>Ingredients</PageTitle>
        <Link href="/ingredients/new" className="block w-full sm:w-auto">
          <Button className={`${ICON_LABEL_GAP_CLASS} w-full sm:w-auto`}>
            <AppIcon name="add" size={18} aria-hidden />
            Add
          </Button>
        </Link>
      </div>
      <Suspense fallback={<IngredientListSkeleton />}>
        <IngredientsPageData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
