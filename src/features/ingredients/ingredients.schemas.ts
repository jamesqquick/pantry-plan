import { z } from "zod";
import { INGREDIENT_DISPLAY_UNITS, INGREDIENT_UNITS, PURCHASE_UNITS, VOLUME_UNITS } from "@/db/schema/enums";
import { deriveIngredientPricing, type IngredientPricingInput } from "@/lib/ingredients/pricing";

const ingredientUnitSchema = z.enum(INGREDIENT_UNITS);
const gramsPerEachSchema = z.preprocess(
  (value) => value == null || (typeof value === "string" && !value.trim()) ? null : value,
  z.coerce.number({ error: "Enter a weight greater than 0, or leave it blank." })
    .positive("Enter a weight greater than 0, or leave it blank.")
    .nullable(),
);

export const ingredientDisplayUnitSchema = z.enum(INGREDIENT_DISPLAY_UNITS);

export const globalIngredientByIdSchema = z.object({
  id: z.string().min(1, "Ingredient id is required"),
});

const ingredientFields = z.object({
  name: z.string().trim().min(1, "Enter an ingredient name.").max(500),
  category: z.string().max(100).optional(),
  defaultUnit: ingredientUnitSchema.optional(),
  purchasePrice: z.coerce.number({ error: "Enter the price you paid, greater than $0." })
    .positive("Enter the price you paid, greater than $0."),
  purchaseQuantity: z.coerce.number({ error: "Enter how much you bought, greater than 0." })
    .positive("Enter how much you bought, greater than 0."),
  purchaseUnit: z.enum(PURCHASE_UNITS),
  volumeAmount: z.coerce.number({ error: "Enter a volume amount greater than 0." })
    .positive("Enter a volume amount greater than 0."),
  volumeUnit: z.enum(VOLUME_UNITS),
  volumeWeightGrams: z.coerce.number({ error: "Enter a number greater than 0." })
    .positive("Enter a number greater than 0."),
  gramsPerEach: gramsPerEachSchema,
  preferredDisplayUnit: ingredientDisplayUnitSchema.default("AUTO"),
  notes: z.string().max(2000).optional(),
  /** Optional global ingredient id (validated server-side: must exist and userId null). */
  baseIngredientId: z.string().min(1).max(100).optional(),
});

function validateDerivedMeasurements(input: IngredientPricingInput, ctx: z.RefinementCtx) {
  const derived = deriveIngredientPricing(input);
  if (input.purchasePrice > 0 && input.purchaseQuantity > 0 &&
    (!Number.isFinite(derived.estimatedCentsPerBasisUnit) || derived.estimatedCentsPerBasisUnit <= 0 || !Number.isFinite(derived.purchasePriceCents))) {
    ctx.addIssue({ code: "custom", path: ["purchaseQuantity"], message: "Enter a purchase amount that gives a valid unit price." });
  }
  if (input.volumeAmount > 0 && input.volumeWeightGrams > 0 && (!Number.isFinite(derived.gramsPerCup) || derived.gramsPerCup <= 0)) {
    ctx.addIssue({ code: "custom", path: ["volumeAmount"], message: "Enter a volume amount that gives a valid weight conversion." });
  }
}

export const ingredientCreateSchema = ingredientFields.superRefine(validateDerivedMeasurements);

export const ingredientUpdateSchema = ingredientFields.extend({
  id: z.string().min(1, "Ingredient id is required"),
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
