import { z } from "zod";

const mealSlotSchema = z.enum(["BREAKFAST", "LUNCH", "DINNER"]);

/** YYYY-MM-DD for a single day */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

/** Week start (Sunday) YYYY-MM-DD */
export const weekStartSchema = dateStringSchema;

export const plannedMealIdSchema = z.object({
  id: z.string().min(1, "Planned meal id is required"),
});

export const upsertPlannedMealSchema = z
  .object({
    date: dateStringSchema,
    mealSlot: mealSlotSchema,
    recipeId: z.string().min(1).optional(),
    customLabel: z.string().min(1).max(120).optional(),
    servings: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().min(1).optional(),
    ),
  })
  .refine(
    (data) =>
      (data.recipeId != null) !==
      (data.customLabel != null && data.customLabel !== ""),
    { message: "Provide either recipeId or customLabel, not both or neither." },
  );

export const updatePlannedMealSchema = z.object({
  id: z.string().min(1, "Planned meal id is required"),
  date: dateStringSchema.optional(),
  mealSlot: mealSlotSchema.optional(),
  recipeId: z.string().min(1).nullable().optional(),
  customLabel: z.string().min(1).max(120).nullable().optional(),
  servings: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(1).nullable().optional(),
  ),
});

export const movePlannedMealSchema = z.object({
  id: z.string().min(1, "Planned meal id is required"),
  date: dateStringSchema,
  mealSlot: mealSlotSchema,
});

export type MealSlot = z.infer<typeof mealSlotSchema>;
export type DateString = z.infer<typeof dateStringSchema>;
export type WeekStart = z.infer<typeof weekStartSchema>;
export type UpsertPlannedMealInput = z.infer<typeof upsertPlannedMealSchema>;
export type UpdatePlannedMealInput = z.infer<typeof updatePlannedMealSchema>;
export type MovePlannedMealInput = z.infer<typeof movePlannedMealSchema>;
