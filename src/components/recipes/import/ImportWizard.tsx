/**
 * Import wizard: URL / Image / Manual tabs for recipe creation.
 * URL and Image parse the recipe, then show an editable draft.
 * Manual renders the full RecipeForm inline under the same tab bar.
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { ImportUrlTab } from "./ImportUrlTab";
import { ImportImageTab } from "./ImportImageTab";
import RecipeForm, {
  type RecipeFormInitial,
} from "@/components/recipes/RecipeForm";

const EMPTY_INITIAL: RecipeFormInitial = {
  title: "",
  sourceUrl: "",
  imageUrl: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
  totalTimeMinutes: "",
  notes: "",
  instructions: [],
  ingredients: [],
  tagIds: [],
};

export interface ImportWizardProps {
  allTags: { id: string; name: string }[];
  imageUploadEnabled?: boolean;
}

export function ImportWizard({ allTags, imageUploadEnabled }: ImportWizardProps) {
  return (
    <Tabs defaultValue="url" className="space-y-6">
      <TabsList>
        <TabsTrigger value="url">From URL</TabsTrigger>
        {imageUploadEnabled && (
          <TabsTrigger value="photo">From photo</TabsTrigger>
        )}
        <TabsTrigger value="manual">Manual</TabsTrigger>
      </TabsList>

      <TabsContent value="url">
        <ImportUrlTab allTags={allTags} />
      </TabsContent>

      {imageUploadEnabled && (
        <TabsContent value="photo">
          <ImportImageTab allTags={allTags} />
        </TabsContent>
      )}

      <TabsContent value="manual">
        <RecipeForm
          mode="create"
          initial={EMPTY_INITIAL}
          allTags={allTags}
        />
      </TabsContent>
    </Tabs>
  );
}
