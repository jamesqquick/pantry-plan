"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { IngredientMappingTable, type MappingRow } from "./ingredient-mapping-table";
import { createEmptyMappingRow } from "./import-wizard-helpers";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";

type CatalogItem = { id: string; name: string };

type IngredientMappingCardProps = {
  title: string;
  rows: MappingRow[];
  setRows: React.Dispatch<React.SetStateAction<MappingRow[]>>;
  suggestions: SuggestionItem[];
  catalog: CatalogItem[];
  onSearchIngredients: (query: string) => Promise<CatalogItem[]>;
  fieldErrors?: Record<string, string[]>;
  firstNeedsAttentionIndex?: number;
  firstNeedsAttentionRef?: React.RefObject<HTMLDivElement | null>;
  /** When provided, show the "X of Y complete / N need attention" callout */
  completeCount?: number;
  needsAttentionCount?: number;
  linesWithContentLength?: number;
};

export function IngredientMappingCard({
  title,
  rows,
  setRows,
  suggestions,
  catalog,
  onSearchIngredients,
  fieldErrors,
  firstNeedsAttentionIndex,
  firstNeedsAttentionRef,
  completeCount,
  needsAttentionCount,
  linesWithContentLength = 0,
}: IngredientMappingCardProps) {
  const showCallout =
    linesWithContentLength > 0 &&
    completeCount != null &&
    needsAttentionCount != null;
  return (
    <Card>
      <CardContent>
        {showCallout && (
          <Callout variant="warning" className="mb-4 text-foreground">
            <p>
              <span className="font-bold text-warning">
                {completeCount} of {linesWithContentLength} ingredients complete
              </span>
              {needsAttentionCount > 0 ? (
                <>
                  .{" "}
                  <span className="text-warning font-medium">
                    {needsAttentionCount} need attention. Cost and scaling
                    results may be partially inaccurate.
                  </span>
                </>
              ) : (
                "."
              )}
            </p>
          </Callout>
        )}
        <SectionHeader
          variant="section"
          title={title}
          action={
            <Button
              type="button"
              variant="secondary"
              aria-label="Add ingredient"
              onClick={() =>
                setRows((prev) => [...prev, createEmptyMappingRow(prev.length)])
              }
              className={cn(ICON_BUTTON_CLASS, "h-9 w-9 shrink-0")}
            >
              <AppIcon name="add" size={18} aria-hidden />
            </Button>
          }
        />
        <IngredientMappingTable
          suggestions={suggestions}
          catalog={catalog}
          onSearchIngredients={onSearchIngredients}
          rows={rows}
          setRows={setRows}
          fieldErrors={fieldErrors}
          firstNeedsAttentionIndex={firstNeedsAttentionIndex}
          firstNeedsAttentionRef={firstNeedsAttentionRef}
        />
      </CardContent>
    </Card>
  );
}
