/**
 * Import wizard: URL / Image / Manual tabs for recipe creation.
 * URL and Image parse the recipe, then show an editable draft.
 * Manual renders the full RecipeForm inline under the same tab bar.
 */

import { useState } from "react";
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
  const [stagedTagNames, setStagedTagNames] = useState<string[]>([]);
  return (
    <Tabs defaultValue="url" className="space-y-6">
      <TabsList aria-label="Recipe import method" className="gap-1">
        <TabsTrigger value="url">From URL</TabsTrigger>
        {imageUploadEnabled && (
          <TabsTrigger value="photo">From photo</TabsTrigger>
        )}
        <TabsTrigger value="manual">Manual</TabsTrigger>
      </TabsList>

      <TabsContent value="url">
        <ImportUrlTab allTags={allTags} stagedTagNames={stagedTagNames} onStagedTagNamesChange={setStagedTagNames} />
      </TabsContent>

      {imageUploadEnabled && (
        <TabsContent value="photo">
          <ImportImageTab allTags={allTags} stagedTagNames={stagedTagNames} onStagedTagNamesChange={setStagedTagNames} />
        </TabsContent>
      )}

      <TabsContent value="manual">
        <RecipeForm
          mode="create"
          initial={EMPTY_INITIAL}
          allTags={allTags}
          stagedTagNames={stagedTagNames}
          onStagedTagNamesChange={setStagedTagNames}
        />
      </TabsContent>
    </Tabs>
  );
}
