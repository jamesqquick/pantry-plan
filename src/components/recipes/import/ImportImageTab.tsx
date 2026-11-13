import { useState } from "react";
import { actions } from "astro:actions";
import type { ParsedRecipeDraft } from "@/actions/parse";
import {
  MAX_RECIPE_IMAGE_BYTES,
  ALLOWED_RECIPE_IMAGE_TYPES,
} from "@/features/parse/parse.schemas";
import { Spinner } from "@/components/ui/Spinner";

export function ImportImageTab({
  onParsed,
  onParsingChange,
  disabled = false,
}: {
  onParsed: (draft: ParsedRecipeDraft) => void;
  onParsingChange: (parsing: boolean) => void;
  disabled?: boolean;
}) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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
    onParsingChange(true);

    // Submit the file directly via FormData. The action declares
    // accept: "form", so Astro decodes this into a real File on the server
    // — no base64 encoding, no 33% inflation.
    const formData = new FormData();
    formData.append("image", file);

    try {
      const { data, error } = await actions.parse.parseFromImage(formData);
      if (error) {
        setParseError(error.message || "Failed to extract recipe from image.");
      } else {
        onParsed(data);
        setFileName(null);
      }
    } catch {
      setParseError("Failed to extract recipe from image. Please try again.");
    } finally {
      setParsing(false);
      onParsingChange(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">Recipe photo</div>
      <label
        htmlFor="recipe-image-upload"
        className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-input border-2 border-dashed border-input p-4 text-center transition-colors hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-ring"
      >
        <span className="text-body text-muted-foreground">
          {parsing
            ? "Extracting recipe…"
            : fileName
              ? <span className="max-w-full break-all">{fileName}</span>
              : "Upload a recipe photo to fill the form"}
        </span>
        <span className="text-meta text-muted-foreground">
          JPEG, PNG, or WebP. Max 4 MB. Importing replaces the current form contents.
        </span>
        <input
          id="recipe-image-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file && !disabled) handleFileSelect(file);
          }}
          disabled={parsing || disabled}
        />
      </label>

      {parsing && (
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <Spinner className="h-4 w-4" label="Analyzing image" />
          Analyzing image with AI… this may take a moment.
        </div>
      )}

      {parseError && (
        <div role="alert" className="rounded-input bg-red-50 p-3 text-body text-red-700">
          <p className="font-medium">Could not extract recipe from image</p>
          <p className="mt-1">{parseError}</p>
          <p className="mt-2 text-meta opacity-80">
            Try a clearer photo, or fill in the form below.
          </p>
        </div>
      )}
    </div>
  );
}
