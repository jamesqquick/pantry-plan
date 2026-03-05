/**
 * Recipe ingredient display types. Used when returning effective ingredients for a recipe.
 */

import type { IngredientUnit } from "@prisma/client";

export type BaseIngredientRow = {
  id: string;
  sortOrder: number;
  ingredientId: string | null;
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
  originalQuantity: number | null;
  originalUnit: IngredientUnit | null;
  weightGrams: number | null;
  conversionSource: string | null;
  conversionConfidence: string | null;
  conversionNotes: string | null;
  ingredient?: { id: string; name: string } | null;
};

export type EffectiveIngredientItem = BaseIngredientRow & {
  source: "base" | "override" | "add";
  provenance: "base" | "override" | "add";
  effectiveId: string;
  displayName?: string | null;
  displayQuantity?: number | null;
  displayUnit?: string | null;
  displayOriginalLine?: string;
};
