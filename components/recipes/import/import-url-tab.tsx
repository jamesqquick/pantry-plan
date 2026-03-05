"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RecipeDetailsSection } from "./recipe-details-section";
import type { RecipeDetailsSectionProps } from "./recipe-details-section";

type ImportUrlTabProps = {
  url: string;
  setUrl: (value: string) => void;
  parseLoading: boolean;
  parseError: string | null;
  onParse: (e: React.FormEvent) => void;
  urlDraft: unknown;
  mappingSectionRef: React.RefObject<HTMLDivElement | null>;
  sectionProps: RecipeDetailsSectionProps;
};

export function ImportUrlTab({
  url,
  setUrl,
  parseLoading,
  parseError,
  onParse,
  urlDraft,
  mappingSectionRef,
  sectionProps,
}: ImportUrlTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <h2 className="mb-6 border-b border-border pb-4 pt-4 text-lg font-medium text-foreground">
            Import from URL
          </h2>
          <div className="space-y-2">
            <form
              onSubmit={onParse}
              className="flex gap-2"
              aria-busy={parseLoading}
            >
              <Input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
                aria-label="Recipe URL"
                disabled={parseLoading}
              />
              <Button
                type="submit"
                disabled={parseLoading}
                aria-busy={parseLoading}
              >
                {parseLoading ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                    Importing…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </form>
            {parseError && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {parseError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      {urlDraft != null && (
        <div ref={mappingSectionRef}>
          <RecipeDetailsSection {...sectionProps} />
        </div>
      )}
    </div>
  );
}
