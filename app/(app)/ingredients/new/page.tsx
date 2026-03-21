import Link from "next/link";
import { PageTitle } from "@/components/ui/page-title";
import { IngredientForm } from "@/components/ingredients/ingredient-form";
import { getIngredientCategoryOptions } from "@/lib/ingredients/category-options";

export default async function NewIngredientPage() {
  const { categories } = await getIngredientCategoryOptions();
  return (
    <div className="space-y-6">
      <Link
        href="/ingredients"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to ingredients
      </Link>
      <PageTitle>New ingredient</PageTitle>
      <IngredientForm mode="create" categories={categories} />
    </div>
  );
}
