"use client";

import { useState } from "react";
import { parseRecipeFromUrlAction, type ParsedRecipeDraft } from "@/app/actions/parse.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  onParsed: (draft: ParsedRecipeDraft) => void;
};

export function RecipeImportForm({ onParsed }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("url", url);
      const result = await parseRecipeFromUrlAction(null, formData);
      if (result.ok) {
        onParsed(result.data);
        setUrl("");
      } else {
        setError(result.error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from URL</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1"
            aria-label="Recipe URL"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Parsing…" : "Import"}
          </Button>
        </form>
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
