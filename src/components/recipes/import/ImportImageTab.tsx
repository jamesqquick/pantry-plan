/**
 * Image import tab: upload a photo of a recipe, parse via OpenAI Vision, review/edit, save.
 */

import { useState, useRef } from "react";
import { actions } from "astro:actions";
import {
  MAX_RECIPE_IMAGE_BYTES,
  ALLOWED_RECIPE_IMAGE_TYPES,
} from "@/features/parse/parse.schemas";
import { Spinner } from "@/components/ui/Spinner";
import { RecipeDraftEditor, type RecipeDraft } from "./RecipeDraftEditor";

export function ImportImageTab({
  allTags,
}: {
  allTags: { id: string; name: string }[];
}) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(file: File) {
    setParseError(null);
    setFileName(file.name);

    if (file.size > MAX_RECIPE_IMAGE_BYTES) {
      setParseError("Image must be 4 MB or smaller.");
      return;
    }
    if (
      !ALLOWED_RECIPE_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_RECIPE_IMAGE_TYPES)[number],
      )
    ) {
      setParseError("Image must be JPEG, PNG, or WebP.");
      return;
    }

    setParsing(true);

    // Submit the file directly via FormData. The action declares
    // accept: "form", so Astro decodes this into a real File on the server
    // — no base64 encoding, no 33% inflation.
    const formData = new FormData();
    formData.append("image", file);

    const { data, error } = await actions.parse.parseFromImage(formData);
    setParsing(false);

    if (error) {
      setParseError(error.message || "Failed to extract recipe from image.");
      return;
    }

    setDraft({
      title: data.title,
      sourceUrl: "",
      imageUrl: "",
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
        <div className="mb-1.5 block text-sm font-medium text-foreground">
          Recipe photo
        </div>
        <label
          htmlFor="recipe-image-upload"
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-input border-2 border-dashed border-input p-6 text-center transition-colors hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-ring"
        >
          {/* Upload icon (Lucide Upload) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          <span className="text-sm text-muted-foreground">
            {parsing
              ? "Extracting recipe..."
              : fileName
                ? <span className="max-w-full break-all">{fileName}</span>
                : "Click to upload a recipe photo"}
          </span>
          <span className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP. Max 4 MB.
          </span>
          <input
            id="recipe-image-upload"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            disabled={parsing}
          />
        </label>
      </div>

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" label="Analyzing image" />
          Analyzing image with AI… this may take a moment.
        </div>
      )}

      {parseError && (
        <div role="alert" className="rounded-input bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-medium">Could not extract recipe from image</p>
          <p className="mt-1">{parseError}</p>
          <p className="mt-2 text-xs opacity-80">
            Try a clearer photo, or use the "From URL" or "Manual" tabs instead.
          </p>
        </div>
      )}
    </div>
  );
}
