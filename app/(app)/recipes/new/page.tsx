import { PageTitle } from "@/components/ui/page-title";
import { ImportWizard } from "@/components/recipes/import/import-wizard";

export default function NewRecipePage() {
  return (
    <div className="space-y-8">
      <PageTitle>New recipe</PageTitle>
      <ImportWizard ingredientsCatalog={[]} />
    </div>
  );
}
