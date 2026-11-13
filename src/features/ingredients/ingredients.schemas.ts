import { z } from "zod";
import { INGREDIENT_DISPLAY_UNITS, INGREDIENT_UNITS, PURCHASE_UNITS, VOLUME_UNITS } from "@/db/schema/enums";
import { deriveIngredientPricing, type IngredientPricingInput } from "@/lib/ingredients/pricing";

export const ingredientDisplayUnitSchema = z.enum(INGREDIENT_DISPLAY_UNITS);
export const OPTIONAL_FIELD_CLEAR_SENTINEL = "__CLEAR_OPTIONAL_FIELD__";
export const PURCHASE_GROUP_ERROR = "To estimate cost, enter the price, amount bought, and unit together. Leave all three blank to skip cost details.";
export const VOLUME_GROUP_ERROR = "To convert volume to weight, enter the volume amount, unit, and weight in grams together. Leave all three blank to skip this conversion.";

function blankToNull(value: unknown) {
  if (value === undefined) return undefined;
  if (value === OPTIONAL_FIELD_CLEAR_SENTINEL || value === null || (typeof value === "string" && !value.trim())) return null;
  return value;
}

const numericInput = z.union([z.number(), z.string().transform(Number)]);

function optionalPositiveNumber(message: string) {
  return z.preprocess(
    blankToNull,
    numericInput.pipe(z.number().positive(message)).nullable(),
  ).optional();
}

function optionalNonnegativeNumber(message: string) {
  return z.preprocess(
    blankToNull,
    numericInput.pipe(z.number().nonnegative(message)).nullable(),
  ).optional();
}

function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToNull, z.enum(values).nullable()).optional();
}

function optionalString(maxLength: number) {
  return z.preprocess(blankToNull, z.string().max(maxLength).nullable()).optional();
}

const createDisplayUnitSchema = z.preprocess(
  (value) => blankToNull(value) ?? "AUTO",
  ingredientDisplayUnitSchema,
);

const updateDisplayUnitSchema = z.preprocess(
  (value) => value === undefined ? undefined : blankToNull(value) ?? "AUTO",
  ingredientDisplayUnitSchema.optional(),
).optional();

export const globalIngredientByIdSchema = z.object({
  id: z.string().min(1, "Ingredient id is required"),
});

const ingredientFields = z.object({
  name: z.string().trim().min(1, "Enter an ingredient name.").max(500),
  category: optionalString(100),
  defaultUnit: optionalEnum(INGREDIENT_UNITS),
  purchasePrice: optionalNonnegativeNumber("Enter a price of $0 or more."),
  purchaseQuantity: optionalPositiveNumber("Enter how much you bought, greater than 0."),
  purchaseUnit: optionalEnum(PURCHASE_UNITS),
  volumeAmount: optionalPositiveNumber("Enter a volume amount greater than 0."),
  volumeUnit: optionalEnum(VOLUME_UNITS),
  volumeWeightGrams: optionalPositiveNumber("Enter a number greater than 0."),
  gramsPerEach: optionalPositiveNumber("Enter a weight greater than 0, or leave it blank."),
  notes: optionalString(2000),
  /** Optional global ingredient id (validated server-side: must exist and userId null). */
  baseIngredientId: z.string().min(1).max(100).optional(),
});

type PurchaseDetails = Pick<IngredientPricingInput, "purchasePrice" | "purchaseQuantity" | "purchaseUnit">;
type VolumeDetails = Pick<IngredientPricingInput, "volumeAmount" | "volumeUnit" | "volumeWeightGrams">;

export function isPurchaseDetailsCompleteOrEmpty(input: PurchaseDetails) {
  const values = [input.purchasePrice, input.purchaseQuantity, input.purchaseUnit];
  return values.every((value) => value == null) || values.every((value) => value != null);
}

export function isVolumeDetailsCompleteOrEmpty(input: VolumeDetails) {
  const values = [input.volumeAmount, input.volumeUnit, input.volumeWeightGrams];
  return values.every((value) => value == null) || values.every((value) => value != null);
}

function validateDerivedMeasurements(input: IngredientPricingInput, ctx: z.RefinementCtx) {
  const derived = deriveIngredientPricing(input);
  const hasValidPurchaseInputs = input.purchasePrice != null && Number.isFinite(input.purchasePrice) && input.purchasePrice >= 0 &&
    input.purchaseQuantity != null && Number.isFinite(input.purchaseQuantity) && input.purchaseQuantity > 0 && input.purchaseUnit != null;
  const hasValidVolumeInputs = input.volumeAmount != null && Number.isFinite(input.volumeAmount) && input.volumeAmount > 0 &&
    input.volumeUnit != null && input.volumeWeightGrams != null && Number.isFinite(input.volumeWeightGrams) && input.volumeWeightGrams > 0;

  if (hasValidPurchaseInputs &&
    (derived.estimatedCentsPerBasisUnit == null || !Number.isFinite(derived.estimatedCentsPerBasisUnit) ||
      derived.estimatedCentsPerBasisUnit < 0 || derived.purchasePriceCents == null || !Number.isFinite(derived.purchasePriceCents))) {
    ctx.addIssue({ code: "custom", path: ["purchaseQuantity"], message: "Enter a purchase amount that gives a valid unit price." });
  }
  if (hasValidVolumeInputs &&
    (derived.gramsPerCup == null || !Number.isFinite(derived.gramsPerCup) || derived.gramsPerCup <= 0)) {
    ctx.addIssue({ code: "custom", path: ["volumeAmount"], message: "Enter a volume amount that gives a valid weight conversion." });
  }
}

function validateCompleteMeasurementGroups(input: IngredientPricingInput, ctx: z.RefinementCtx) {
  const purchaseValuesAreValid =
    (input.purchasePrice == null || Number.isFinite(input.purchasePrice) && input.purchasePrice >= 0) &&
    (input.purchaseQuantity == null || Number.isFinite(input.purchaseQuantity) && input.purchaseQuantity > 0) &&
    (input.purchaseUnit == null || PURCHASE_UNITS.includes(input.purchaseUnit));
  const volumeValuesAreValid =
    (input.volumeAmount == null || Number.isFinite(input.volumeAmount) && input.volumeAmount > 0) &&
    (input.volumeUnit == null || VOLUME_UNITS.includes(input.volumeUnit)) &&
    (input.volumeWeightGrams == null || Number.isFinite(input.volumeWeightGrams) && input.volumeWeightGrams > 0);

  if (purchaseValuesAreValid && !isPurchaseDetailsCompleteOrEmpty(input)) {
    if (input.purchasePrice == null) {
      ctx.addIssue({ code: "custom", path: ["purchasePrice"], message: PURCHASE_GROUP_ERROR });
    }
    if (input.purchaseQuantity == null) {
      ctx.addIssue({ code: "custom", path: ["purchaseQuantity"], message: PURCHASE_GROUP_ERROR });
    }
    if (input.purchaseUnit == null) {
      ctx.addIssue({ code: "custom", path: ["purchaseUnit"], message: PURCHASE_GROUP_ERROR });
    }
  }

  if (volumeValuesAreValid && !isVolumeDetailsCompleteOrEmpty(input)) {
    if (input.volumeAmount == null) {
      ctx.addIssue({ code: "custom", path: ["volumeAmount"], message: VOLUME_GROUP_ERROR });
    }
    if (input.volumeUnit == null) {
      ctx.addIssue({ code: "custom", path: ["volumeUnit"], message: VOLUME_GROUP_ERROR });
    }
    if (input.volumeWeightGrams == null) {
      ctx.addIssue({ code: "custom", path: ["volumeWeightGrams"], message: VOLUME_GROUP_ERROR });
    }
  }
}

export const ingredientCreateSchema = ingredientFields.extend({
  preferredDisplayUnit: createDisplayUnitSchema,
}).superRefine((input, ctx) => {
  validateDerivedMeasurements(input, ctx);
  validateCompleteMeasurementGroups(input, ctx);
});

export const ingredientUpdateSchema = ingredientFields.extend({
  id: z.string().min(1, "Ingredient id is required"),
  preferredDisplayUnit: updateDisplayUnitSchema,
}).superRefine(validateDerivedMeasurements);

export const ingredientIdSchema = z.object({
  id: z.string().min(1, "Ingredient id is required"),
});

export const ingredientNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
});

/** For picker search: allow the full ingredient name. */
export const ingredientSearchQuerySchema = z
  .string()
  .max(500)
  .transform((s) => s.trim());

export type IngredientCreateInput = z.infer<typeof ingredientCreateSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateSchema>;
export type IngredientIdInput = z.infer<typeof ingredientIdSchema>;
export type IngredientNameInput = z.infer<typeof ingredientNameSchema>;
