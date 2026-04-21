/**
 * URL import tab: paste a recipe URL, parse it, review/edit the draft, save.
 */

import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RecipeDraftEditor, type RecipeDraft } from "./RecipeDraftEditor";

export function ImportUrlTab({
  allTags,
}: {
  allTags: { id: string; name: string }[];
}) {
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  async function handleParse() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setParsing(true);
    setParseError(null);

    const { data, error } = await actions.parse.parseFromUrl({ url: trimmed });
    setParsing(false);

    if (error) {
      setParseError(error.message || "Failed to parse recipe from URL.");
      return;
    }

    setDraft({
      title: data.title,
      sourceUrl: data.sourceUrl,
      imageUrl: data.imageUrl ?? "",
      servings: data.servings,
      prepTimeMinutes: data.prepTimeMinutes,
      cookTimeMinutes: data.cookTimeMinutes,
      totalTimeMinutes: data.totalTimeMinutes,
      ingredients: data.ingredients,
      instructions: data.instructions,
      notes: data.notes ?? "",
    });
  }

  if (draft) {
    return (
      <RecipeDraftEditor
        draft={draft}
        onBack={() => setDraft(null)}
        allTags={allTags}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="import-url"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Recipe URL
        </label>
        <div className="flex gap-2">
          <Input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleParse();
              }
            }}
            placeholder="https://www.allrecipes.com/recipe/..."
            className="flex-1"
            disabled={parsing}
          />
          <Button
            onClick={handleParse}
            disabled={parsing || !url.trim()}
            className="shrink-0 px-5 whitespace-nowrap"
          >
            {parsing ? "Parsing..." : "Import"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste a link to any recipe page. We'll extract the recipe data
          automatically.
        </p>
      </div>

      {parseError && (
        <div className="rounded-input bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {parseError}
        </div>
      )}
    </div>
  );
}
