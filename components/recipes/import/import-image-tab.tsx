"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RecipeDetailsSection } from "./recipe-details-section";
import type { RecipeDetailsSectionProps } from "./recipe-details-section";

type ImportImageTabProps = {
  imageParseLoading: boolean;
  imageParseError: string | null;
  onImageParse: (e: React.FormEvent<HTMLFormElement>) => void;
  imageDraft: unknown;
  mappingSectionRef: React.RefObject<HTMLDivElement | null>;
  sectionProps: RecipeDetailsSectionProps;
};

export function ImportImageTab({
  imageParseLoading,
  imageParseError,
  onImageParse,
  imageDraft,
  mappingSectionRef,
  sectionProps,
}: ImportImageTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <h2 className="mb-6 border-b border-border pb-4 pt-4 text-lg font-medium text-foreground">
            Upload image
          </h2>
          <div className="space-y-2">
            <form
              onSubmit={onImageParse}
              className="flex flex-wrap items-end gap-2"
              aria-busy={imageParseLoading}
            >
              <div className="min-w-[200px] flex-1">
                <input
                  type="file"
                  name="image"
                  id="recipe-image"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-foreground file:mr-2 file:rounded-input file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
                  aria-label="Recipe image"
                  disabled={imageParseLoading}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Max 4 MB. JPEG, PNG, or WebP.
                </p>
              </div>
              <Button
                type="submit"
                disabled={imageParseLoading}
                aria-busy={imageParseLoading}
              >
                {imageParseLoading ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden
                    />
                    Scanning…
                  </>
                ) : (
                  "Scan & Autofill"
                )}
              </Button>
            </form>
            {imageParseError && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {imageParseError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      {imageDraft != null && (
        <div ref={mappingSectionRef}>
          <RecipeDetailsSection {...sectionProps} />
        </div>
      )}
    </div>
  );
}
