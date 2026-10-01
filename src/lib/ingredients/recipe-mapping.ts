import type { IngredientUnit } from "@/db/schema/enums";

export const NEW_INGREDIENT_INSERT_PARAMS_PER_ROW = 5;

export type RecipeMappingItemSetValidation =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "mismatch" };

export function validateRecipeMappingItemSet(
  currentIds: readonly string[],
  submittedIds: readonly string[],
): RecipeMappingItemSetValidation {
  const submittedSet = new Set(submittedIds);
  if (submittedSet.size !== submittedIds.length) {
    return { ok: false, reason: "duplicate" };
  }

  if (
    currentIds.length !== submittedIds.length ||
    currentIds.some((id) => !submittedSet.has(id))
  ) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}

export function recipeMappingVersionsMatch(
  currentRows: readonly { id: string; updatedAt: number }[],
  submittedRows: readonly { id: string; updatedAt: number }[],
): boolean {
  if (currentRows.length !== submittedRows.length) return false;

  const submittedVersionById = new Map(
    submittedRows.map((row) => [row.id, row.updatedAt]),
  );
  return currentRows.every(
    (row) => submittedVersionById.get(row.id) === row.updatedAt,
  );
}

export type IngredientResolutionRow = {
  id: string;
  normalizedName: string;
  userId: string | null;
};

export function buildPreferredIngredientMap(
  rows: readonly IngredientResolutionRow[],
  userId: string,
): Map<string, IngredientResolutionRow> {
  const preferred = new Map<string, IngredientResolutionRow>();

  for (const row of rows) {
    if (row.userId !== null && row.userId !== userId) continue;

    const current = preferred.get(row.normalizedName);
    if (!current) {
      preferred.set(row.normalizedName, row);
      continue;
    }

    const rowIsUserOwned = row.userId === userId;
    const currentIsUserOwned = current.userId === userId;
    if (
      (rowIsUserOwned && !currentIsUserOwned) ||
      (rowIsUserOwned === currentIsUserOwned && row.id < current.id)
    ) {
      preferred.set(row.normalizedName, row);
    }
  }

  return preferred;
}

export function getTenantScopedCurrentIngredient(
  input: {
    id: string | null;
    name: string | null;
    normalizedName: string | null;
    userId: string | null;
  },
  currentUserId: string,
): { id: string; name: string; normalizedName: string } | null {
  if (
    input.id === null ||
    input.name === null ||
    input.normalizedName === null ||
    (input.userId !== null && input.userId !== currentUserId)
  ) {
    return null;
  }

  return {
    id: input.id,
    name: input.name,
    normalizedName: input.normalizedName,
  };
}

export function getClearedRecipeIngredientConversionFields() {
  return {
    weightGrams: null,
    conversionSource: null,
    conversionConfidence: null,
    conversionNotes: null,
  } as const;
}

export type RecipeIngredientMappingUpdateRow = {
  id: string;
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
};

export type RecipeIngredientConversionFields = Pick<
  RecipeIngredientMappingUpdateRow,
  | "weightGrams"
  | "conversionSource"
  | "conversionConfidence"
  | "conversionNotes"
>;

export function deriveRecipeIngredientMappingUpdate(
  current: RecipeIngredientMappingUpdateRow,
  desired: Pick<
    RecipeIngredientMappingUpdateRow,
    "ingredientId" | "quantity" | "unit" | "displayText"
  >,
  nextConversionFields?: RecipeIngredientConversionFields,
): RecipeIngredientMappingUpdateRow | null {
  const structureChanged =
    current.ingredientId !== desired.ingredientId ||
    current.quantity !== desired.quantity ||
    current.unit !== desired.unit;

  if (!structureChanged && current.displayText === desired.displayText) {
    return null;
  }

  return {
    id: current.id,
    ...desired,
    originalQuantity: structureChanged
      ? desired.quantity
      : current.originalQuantity,
    originalUnit: structureChanged ? desired.unit : current.originalUnit,
    ...(structureChanged
      ? (nextConversionFields ?? getClearedRecipeIngredientConversionFields())
      : {
          weightGrams: current.weightGrams,
          conversionSource: current.conversionSource,
          conversionConfidence: current.conversionConfidence,
          conversionNotes: current.conversionNotes,
        }),
  };
}

export function getUnmappedSuggestionLines(
  rows: readonly {
    line: string;
    currentIngredientId: string | null;
  }[],
): Array<{ rowIndex: number; line: string }> {
  return rows.flatMap((row, rowIndex) =>
    row.currentIngredientId ? [] : [{ rowIndex, line: row.line }],
  );
}

export function getRecipeMappingPreviewFields(input: {
  isMapped: boolean;
  rawText: string;
  storedDisplayText: string;
  storedQuantity: number | null;
  storedUnit: IngredientUnit | null;
  parsedDisplayText: string;
  parsedQuantity: number | null;
  parsedUnit: IngredientUnit | null;
}): {
  displayText: string;
  quantity: number | null;
  unit: IngredientUnit | null;
} {
  const useParsedFields =
    !input.isMapped && input.storedDisplayText === input.rawText;

  return {
    displayText: useParsedFields
      ? input.parsedDisplayText.trim() || input.storedDisplayText
      : input.storedDisplayText,
    quantity:
      input.storedQuantity ?? (useParsedFields ? input.parsedQuantity : null),
    unit: input.storedUnit ?? (useParsedFields ? input.parsedUnit : null),
  };
}
