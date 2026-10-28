import { z } from "zod";
import { INGREDIENT_UNITS } from "@/db/schema/enums";
import { requiredIngredientMeasurementsSchema } from "@/features/recipes/ingredient-measurements";
import { optionalHttpUrlSchema } from "@/lib/url";

const validDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  });

const mcpRecipeIngredientSchema = z
  .object({
    ...requiredIngredientMeasurementsSchema.shape,
    displayText: z.string().trim().min(1).max(500),
    rawText: z.string().max(1_000).nullable().optional(),
  })
  .strict();

const recipeToolFields = {
  title: z.string().trim().min(1).max(500),
  sourceUrl: optionalHttpUrlSchema,
  imageUrl: optionalHttpUrlSchema,
  servings: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  ingredients: z.array(mcpRecipeIngredientSchema).min(1).max(200),
  instructions: z.array(z.string().trim().min(1).max(5_000)).min(1).max(200),
  notes: z.string().max(20_000).optional(),
};

export const createRecipeToolSchema = z.object(recipeToolFields).strict();

export const getRecipeToolSchema = z
  .object({
    recipeId: z.string().trim().min(1).max(100),
  })
  .strict();

export const editRecipeToolSchema = z
  .object({
    recipeId: z.string().trim().min(1).max(100),
    title: recipeToolFields.title.optional(),
    sourceUrl: optionalHttpUrlSchema.nullable().optional(),
    imageUrl: optionalHttpUrlSchema.nullable().optional(),
    servings: recipeToolFields.servings.nullable().optional(),
    prepTimeMinutes: recipeToolFields.prepTimeMinutes.nullable().optional(),
    cookTimeMinutes: recipeToolFields.cookTimeMinutes.nullable().optional(),
    totalTimeMinutes: recipeToolFields.totalTimeMinutes.nullable().optional(),
    ingredients: recipeToolFields.ingredients.optional(),
    instructions: recipeToolFields.instructions.optional(),
    notes: recipeToolFields.notes.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      Object.entries(input).some(
        ([key, value]) => key !== "recipeId" && value !== undefined,
      ),
    "At least one recipe field must be provided.",
  );

export type McpRecipeIngredient = z.infer<typeof recipeDetailsOutputSchema>["ingredients"][number];
export type CreateRecipeToolInput = z.infer<typeof createRecipeToolSchema>;
export type GetRecipeToolInput = z.infer<typeof getRecipeToolSchema>;
export type EditRecipeToolInput = z.infer<typeof editRecipeToolSchema>;

export const importRecipeFromUrlToolSchema = z.object({
  url: z.string().max(2_048),
}).strict();

export const searchRecipesToolSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(25).default(10),
  tag: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Only return recipes with this tag name."),
}).strict();

const plannedMealToolSchema = z.object({
  date: validDateStringSchema,
  mealSlot: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  recipeId: z.string().trim().min(1),
  servings: z.number().int().min(1).optional(),
}).strict();

export const createWeeklyMealPlanToolSchema = z.object({
  weekStart: validDateStringSchema,
  meals: z.array(plannedMealToolSchema).max(100),
}).strict();

export const createdRecipeOutputSchema = z.object({
  recipeId: z.string(),
  title: z.string(),
  recipeUrl: z.url(),
}).strict();

const recipeSummaryFields = {
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  servings: z.number().nullable(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  totalTimeMinutes: z.number().nullable(),
  recipeUrl: z.url(),
};

export const recipeDetailsOutputSchema = z.object({
  ...recipeSummaryFields,
  notes: z.string().nullable(),
  ingredients: z.array(z.object({
    quantity: z.number(),
    unit: z.enum(INGREDIENT_UNITS),
    displayText: z.string(),
    rawText: z.string().nullable().optional(),
  }).strict()),
  instructions: z.array(z.string()),
}).strict();

export const searchRecipesOutputSchema = z.object({
  query: z.string(),
  tag: z.string().nullable(),
  mode: z.enum(["semantic", "title", "degraded"]),
  count: z.number().int().nonnegative(),
  recipes: z.array(z.object(recipeSummaryFields).strict()),
}).strict();

export const weeklyMealPlanOutputSchema = z.object({
  weekStart: validDateStringSchema,
  mealCount: z.number().int().nonnegative(),
  mealPlanUrl: z.url(),
}).strict();

export type CreateWeeklyMealPlanToolInput = z.infer<
  typeof createWeeklyMealPlanToolSchema
>;

export const createMcpApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const revokeMcpApiKeySchema = z.object({
  id: z.string().min(1, "Key id is required").max(100),
});
