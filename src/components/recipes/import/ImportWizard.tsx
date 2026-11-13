import { useState } from "react";
import { ImageUp, Link2 } from "lucide-react";
import type { ParsedRecipeDraft } from "@/actions/parse";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { ImportImageTab } from "./ImportImageTab";
import { ImportUrlTab } from "./ImportUrlTab";
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
  const [activeImport, setActiveImport] = useState<"url" | "photo" | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [formBusy, setFormBusy] = useState(false);

  function applyParsedRecipe(draft: ParsedRecipeDraft) {
    setInitial(parsedRecipeToFormInitial(draft));
    setImportVersion((version) => version + 1);
    setActiveImport(null);
    setImportUrl("");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 border-y border-border py-6" aria-label="Import options">
        <p className="text-meta font-semibold uppercase tracking-widest text-eyebrow">Start with an import</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" className="min-h-11" onClick={() => setActiveImport("url")} disabled={formBusy}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Import from URL
          </Button>
          {imageUploadEnabled && (
            <Button variant="secondary" className="min-h-11" onClick={() => setActiveImport("photo")} disabled={formBusy}>
              <ImageUp className="h-4 w-4" aria-hidden="true" />
              Import from photo
            </Button>
          )}
        </div>
        <p className="text-meta text-muted-foreground">Importing replaces the current form contents.</p>
      </section>
      <RecipeForm
        key={importVersion}
        mode="create"
        initial={initial}
        allTags={allTags}
        onBusyChange={setFormBusy}
      />
      <Dialog open={activeImport !== null} onOpenChange={(open) => {
        if (!open && !importing) setActiveImport(null);
      }}>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 shadow-none" onEscapeKeyDown={(event) => {
          if (importing) event.preventDefault();
        }}>
          <div className="flex min-h-full flex-col">
            <div className="flex min-h-20 items-center border-b border-border px-6 pr-20 pt-[env(safe-area-inset-top)] sm:px-10">
              <span className="text-meta font-semibold uppercase tracking-widest text-eyebrow">Quick Pantry / New recipe</span>
            </div>
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12 pb-[calc(3rem+env(safe-area-inset-bottom))]">
              <DialogTitle className="font-display text-4xl tracking-tight sm:text-5xl">
                {activeImport === "photo" ? "Import from photo" : "Import from URL"}
              </DialogTitle>
              <DialogDescription className="mt-3 mb-8 text-body text-muted-foreground">
                {activeImport === "photo"
                  ? "Upload a clear photo of a recipe card or cookbook page. You can edit everything after it’s imported."
                  : "Paste a recipe link. We’ll pull in the ingredients, instructions, and details for you to review before saving."}
              </DialogDescription>
              {activeImport === "photo" ? (
                <ImportImageTab onParsed={applyParsedRecipe} onParsingChange={setImporting} />
              ) : (
                <ImportUrlTab url={importUrl} onChange={setImportUrl} onParsed={applyParsedRecipe} onParsingChange={setImporting} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
