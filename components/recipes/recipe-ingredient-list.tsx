"use client";

import { formatIngredientLine } from "@/lib/ingredientLineFormat";
import { UNIT_LABELS } from "@/lib/ingredients/units";
import type { MeasurementMode } from "./measurement-toggle";
import type { IngredientUnit } from "@/generated/prisma/client";

type RecipeIngredientItem = {
  id: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  originalLine: string;
  originalQuantity: number | null;
  originalUnit: IngredientUnit | null;
  displayText: string;
  weightGrams: number | null;
  conversionSource: string | null;
  conversionConfidence: string | null;
  ingredient: { id: string; name: string; defaultUnit: IngredientUnit | null };
};

/** Build display line from structured fields only; never uses raw/originalLine for display. */
function getStructuredLine(ri: RecipeIngredientItem): string {
  const unitLabel = ri.unit ? UNIT_LABELS[ri.unit] : null;
  const line = formatIngredientLine({
    quantity: ri.quantity ?? ri.originalQuantity ?? null,
    unit: unitLabel,
    nameNormalized: null,
    ingredientName: (ri.displayText?.trim() || ri.ingredient?.name) ?? null,
  });
  return line;
}

function roundGrams(g: number): number {
  return Math.round(g);
}

export function StructuredRecipeIngredientList({
  recipeIngredients,
  mode,
}: {
  recipeIngredients: RecipeIngredientItem[];
  mode: MeasurementMode;
}) {
  return (
    <ul className="mt-2 list-inside list-disc space-y-1 text-foreground">
      {recipeIngredients.map((ri) => {
        const structuredLine = getStructuredLine(ri);
        const hasWeight = ri.weightGrams != null;
        const weightStr = hasWeight ? `≈ ${roundGrams(ri.weightGrams!)} g` : null;

        let line: string;
        if (mode === "original") {
          line = structuredLine;
        } else if (mode === "weight") {
          line = hasWeight ? weightStr! : structuredLine;
        } else if (mode === "volume") {
          line = structuredLine;
        } else {
          const parts = [structuredLine];
          if (hasWeight) parts.push(`(${weightStr})`);
          line = parts.join(" ");
        }

        return (
          <li key={ri.id} className="flex flex-wrap items-baseline gap-2">
            <span>{line}</span>
          </li>
        );
      })}
    </ul>
  );
}
