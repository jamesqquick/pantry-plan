import { useState } from "react";
import type { ParsedRecipeDraft } from "@/actions/parse";
import { ImportImageTab } from "./ImportImageTab";
import RecipeForm, {
  type RecipeFormInitial,
} from "@/components/recipes/RecipeForm";
import { parsedRecipeToFormInitial } from "./parsedRecipeToFormInitial";

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
  const [initial, setInitial] = useState(EMPTY_INITIAL);
  const [importVersion, setImportVersion] = useState(0);
  const [parsingPhoto, setParsingPhoto] = useState(false);
  const [formBusy, setFormBusy] = useState(false);

  function applyParsedRecipe(draft: ParsedRecipeDraft) {
    setInitial(parsedRecipeToFormInitial(draft));
    setImportVersion((version) => version + 1);
  }

  return (
    <div className="space-y-6">
      {imageUploadEnabled && (
        <ImportImageTab
          onParsed={applyParsedRecipe}
          onParsingChange={setParsingPhoto}
          disabled={formBusy}
        />
      )}
      <RecipeForm
        key={importVersion}
        mode="create"
        initial={initial}
        allTags={allTags}
        onParsedRecipe={applyParsedRecipe}
        importingPhoto={parsingPhoto}
        onBusyChange={setFormBusy}
      />
    </div>
  );
}
