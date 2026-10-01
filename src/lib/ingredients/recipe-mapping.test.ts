import { describe, expect, it } from "vitest";
import { chunkRows } from "@/db/chunked-insert";
import {
  buildPreferredIngredientMap,
  deriveRecipeIngredientMappingUpdate,
  getClearedRecipeIngredientConversionFields,
  getRecipeMappingPreviewFields,
  getTenantScopedCurrentIngredient,
  getUnmappedSuggestionLines,
  NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
  recipeMappingVersionsMatch,
  validateRecipeMappingItemSet,
} from "./recipe-mapping";

describe("validateRecipeMappingItemSet", () => {
  it("accepts the exact row set in any order", () => {
    expect(
      validateRecipeMappingItemSet(["row-1", "row-2"], ["row-2", "row-1"]),
    ).toEqual({ ok: true });
  });

  it("rejects duplicate submitted row ids", () => {
    expect(
      validateRecipeMappingItemSet(["row-1", "row-2"], ["row-1", "row-1"]),
    ).toEqual({ ok: false, reason: "duplicate" });
  });

  it.each([
    [["row-1", "row-2"], ["row-1"]],
    [["row-1"], ["row-1", "foreign-row"]],
    [["row-1", "row-2"], ["row-1", "stale-row"]],
  ])("rejects a non-exact row set", (currentIds, submittedIds) => {
    expect(validateRecipeMappingItemSet(currentIds, submittedIds)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });
});

describe("recipeMappingVersionsMatch", () => {
  const submittedRows = [
    { id: "row-1", updatedAt: 1000 },
    { id: "row-2", updatedAt: 2000 },
  ];

  it("accepts the exact row versions in any order", () => {
    expect(
      recipeMappingVersionsMatch(submittedRows, [...submittedRows].reverse()),
    ).toBe(true);
  });

  it("rejects stale, added, or removed rows", () => {
    expect(
      recipeMappingVersionsMatch(
        [
          { id: "row-1", updatedAt: 1001 },
          { id: "row-2", updatedAt: 2000 },
        ],
        submittedRows,
      ),
    ).toBe(false);
    expect(
      recipeMappingVersionsMatch(
        [...submittedRows, { id: "row-3", updatedAt: 3000 }],
        submittedRows,
      ),
    ).toBe(false);
    expect(recipeMappingVersionsMatch([submittedRows[0]], submittedRows)).toBe(
      false,
    );
  });
});

describe("buildPreferredIngredientMap", () => {
  it("prefers a user-owned ingredient over a global ingredient", () => {
    const preferred = buildPreferredIngredientMap(
      [
        { id: "global", normalizedName: "salt", userId: null },
        { id: "custom", normalizedName: "salt", userId: "user-1" },
      ],
      "user-1",
    );

    expect(preferred.get("salt")?.id).toBe("custom");
  });

  it("uses the stable lowest id for equal-scope duplicates", () => {
    const preferred = buildPreferredIngredientMap(
      [
        { id: "global-z", normalizedName: "salt", userId: null },
        { id: "global-a", normalizedName: "salt", userId: null },
      ],
      "user-1",
    );

    expect(preferred.get("salt")?.id).toBe("global-a");
  });
});

describe("getRecipeMappingPreviewFields", () => {
  it("preserves stored structured values and display text for mapped rows", () => {
    expect(
      getRecipeMappingPreviewFields({
        isMapped: true,
        rawText: "2 cans tomatoes",
        storedDisplayText: "hand-edited tomatoes",
        storedQuantity: 3,
        storedUnit: "COUNT",
        parsedDisplayText: "cans tomatoes",
        parsedQuantity: 2,
        parsedUnit: "CUP",
      }),
    ).toEqual({
      displayText: "hand-edited tomatoes",
      quantity: 3,
      unit: "COUNT",
    });
  });

  it("uses parsed values only when stored structured values are null", () => {
    expect(
      getRecipeMappingPreviewFields({
        isMapped: false,
        rawText: "2 cups flour",
        storedDisplayText: "2 cups flour",
        storedQuantity: null,
        storedUnit: null,
        parsedDisplayText: "flour",
        parsedQuantity: 2,
        parsedUnit: "CUP",
      }),
    ).toEqual({ displayText: "flour", quantity: 2, unit: "CUP" });
  });

  it("preserves a stored zero quantity", () => {
    expect(
      getRecipeMappingPreviewFields({
        isMapped: true,
        rawText: "salt",
        storedDisplayText: "salt",
        storedQuantity: 0,
        storedUnit: null,
        parsedDisplayText: "salt",
        parsedQuantity: 1,
        parsedUnit: "PINCH",
      }).quantity,
    ).toBe(0);
  });

  it("preserves manually edited display text on an unmapped row", () => {
    expect(
      getRecipeMappingPreviewFields({
        isMapped: false,
        rawText: "2 cups all-purpose flour",
        storedDisplayText: "bread flour",
        storedQuantity: null,
        storedUnit: null,
        parsedDisplayText: "all-purpose flour",
        parsedQuantity: 2,
        parsedUnit: "CUP",
      }),
    ).toEqual({
      displayText: "bread flour",
      quantity: null,
      unit: null,
    });
  });

  it("does not reparse a mapped row with null structured values", () => {
    expect(
      getRecipeMappingPreviewFields({
        isMapped: true,
        rawText: "2 cups flour",
        storedDisplayText: "flour",
        storedQuantity: null,
        storedUnit: null,
        parsedDisplayText: "flour",
        parsedQuantity: 2,
        parsedUnit: "CUP",
      }),
    ).toEqual({ displayText: "flour", quantity: null, unit: null });
  });
});

describe("getUnmappedSuggestionLines", () => {
  it("skips mapped rows while preserving unresolved row positions", () => {
    expect(
      getUnmappedSuggestionLines([
        { line: "salt", currentIngredientId: "salt-id" },
        { line: "mystery spice", currentIngredientId: null },
        { line: "flour", currentIngredientId: "flour-id" },
        { line: "another mystery", currentIngredientId: null },
      ]),
    ).toEqual([
      { rowIndex: 1, line: "mystery spice" },
      { rowIndex: 3, line: "another mystery" },
    ]);
  });
});

describe("getTenantScopedCurrentIngredient", () => {
  it("allows global and current-user ingredients", () => {
    expect(
      getTenantScopedCurrentIngredient(
        {
          id: "global-1",
          name: "Salt",
          normalizedName: "salt",
          userId: null,
        },
        "user-1",
      ),
    ).toEqual({ id: "global-1", name: "Salt", normalizedName: "salt" });
    expect(
      getTenantScopedCurrentIngredient(
        {
          id: "custom-1",
          name: "Finishing salt",
          normalizedName: "finishing salt",
          userId: "user-1",
        },
        "user-1",
      )?.id,
    ).toBe("custom-1");
  });

  it("rejects foreign or missing joined ingredients", () => {
    expect(
      getTenantScopedCurrentIngredient(
        {
          id: "foreign-1",
          name: "Private spice",
          normalizedName: "private spice",
          userId: "user-2",
        },
        "user-1",
      ),
    ).toBeNull();
    expect(
      getTenantScopedCurrentIngredient(
        { id: null, name: null, normalizedName: null, userId: null },
        "user-1",
      ),
    ).toBeNull();
  });
});

describe("getClearedRecipeIngredientConversionFields", () => {
  it("clears every derived conversion field", () => {
    expect(getClearedRecipeIngredientConversionFields()).toEqual({
      weightGrams: null,
      conversionSource: null,
      conversionConfidence: null,
      conversionNotes: null,
    });
  });
});

const currentUpdateRow = {
  id: "row-1",
  ingredientId: "ingredient-1",
  quantity: 2,
  unit: "CUP" as const,
  displayText: "flour",
  originalQuantity: 1.5,
  originalUnit: "CUP" as const,
  weightGrams: 240,
  conversionSource: "density",
  conversionConfidence: "High",
  conversionNotes: "manual density",
};

describe("deriveRecipeIngredientMappingUpdate", () => {
  it("preserves conversion and original fields for a display-only edit", () => {
    expect(
      deriveRecipeIngredientMappingUpdate(currentUpdateRow, {
        ingredientId: "ingredient-1",
        quantity: 2,
        unit: "CUP",
        displayText: "sifted flour",
      }),
    ).toEqual({
      ...currentUpdateRow,
      displayText: "sifted flour",
    });
  });

  it.each([
    { ingredientId: "ingredient-2", quantity: 2, unit: "CUP" as const },
    { ingredientId: "ingredient-1", quantity: 3, unit: "CUP" as const },
    { ingredientId: "ingredient-1", quantity: 2, unit: "TBSP" as const },
    { ingredientId: null, quantity: 2, unit: "CUP" as const },
  ])("clears conversion fields when mapping structure changes", (desired) => {
    expect(
      deriveRecipeIngredientMappingUpdate(currentUpdateRow, {
        ...desired,
        displayText: "flour",
      }),
    ).toMatchObject({
      ...desired,
      originalQuantity: desired.quantity,
      originalUnit: desired.unit,
      weightGrams: null,
      conversionSource: null,
      conversionConfidence: null,
      conversionNotes: null,
    });
  });

  it("skips a completely unchanged row", () => {
    expect(
      deriveRecipeIngredientMappingUpdate(currentUpdateRow, {
        ingredientId: "ingredient-1",
        quantity: 2,
        unit: "CUP",
        displayText: "flour",
      }),
    ).toBeNull();
  });

  it("uses recomputed conversion fields when mapping structure changes", () => {
    expect(
      deriveRecipeIngredientMappingUpdate(
        currentUpdateRow,
        {
          ingredientId: "ingredient-2",
          quantity: 3,
          unit: "TBSP",
          displayText: "flour",
        },
        {
          weightGrams: 24,
          conversionSource: "AUTO",
          conversionConfidence: "HIGH",
          conversionNotes: null,
        },
      ),
    ).toMatchObject({
      ingredientId: "ingredient-2",
      quantity: 3,
      unit: "TBSP",
      originalQuantity: 3,
      originalUnit: "TBSP",
      weightGrams: 24,
      conversionSource: "AUTO",
      conversionConfidence: "HIGH",
      conversionNotes: null,
    });
  });
});

describe("recipe mapping write chunks", () => {
  it("fits 200 ingredient inserts within conservative statement limits", () => {
    const insertChunks = chunkRows(
      Array.from({ length: 200 }, (_, index) => index),
      NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
    );

    expect(insertChunks).toHaveLength(12);
  });
});
