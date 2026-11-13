import { useState } from "react";
import { actions } from "astro:actions";
import type { ParsedRecipeDraft } from "@/actions/parse";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  url: string;
  onChange: (url: string) => void;
  onParsed: (draft: ParsedRecipeDraft) => void;
  onParsingChange: (parsing: boolean) => void;
  disabled?: boolean;
}

export function ImportUrlTab({ url, onChange, onParsed, onParsingChange, disabled }: Props) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleParse() {
    const trimmed = url.trim();
    if (!trimmed || parsing || disabled) return;
    setParsing(true);
    onParsingChange(true);
    setParseError(null);

    try {
      const { data, error } = await actions.parse.parseFromUrl({ url: trimmed });
      if (error) {
        setParseError(error.message || "Failed to parse recipe from URL.");
      } else {
        onParsed(data);
      }
    } catch {
      setParseError("Failed to parse recipe from URL. Please try again.");
    } finally {
      setParsing(false);
      onParsingChange(false);
    }
  }

  return (
    <div>
      <label htmlFor="importRecipeUrl" className="mb-1 block text-sm font-medium">
        Recipe URL
      </label>
      <div className="space-y-6">
        <Input
          id="importRecipeUrl"
          name="importRecipeUrl"
          type="url"
          autoComplete="url"
          value={url}
          onChange={(event) => {
            onChange(event.target.value);
            setParseError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && url.trim()) {
              event.preventDefault();
              handleParse();
            }
          }}
          placeholder="https://example.com/recipe"
          className="h-12 w-full"
          disabled={parsing || disabled}
        />
        <Button
          type="button"
          onClick={handleParse}
          disabled={parsing || disabled || !url.trim()}
          aria-busy={parsing}
          className="min-h-11 gap-2 px-5"
        >
          {parsing && <Spinner className="h-4 w-4" label="Parsing recipe" />}
          {parsing ? "Importing…" : "Import URL"}
        </Button>
      </div>
      {parseError && (
        <p role="alert" className="mt-2 text-meta text-destructive">{parseError}</p>
      )}
    </div>
  );
}
