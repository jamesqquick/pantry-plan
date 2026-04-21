import { ActionError, defineAction } from "astro:actions";
import { and, asc, count, desc, eq, isNull, like, ne, or } from "drizzle-orm";
import { z } from "zod";
import {
  ingredientCreateSchema,
  ingredientUpdateSchema,
  ingredientIdSchema,
  ingredientNameSchema,
  ingredientSearchQuerySchema,
  globalIngredientByIdSchema,
} from "@/features/ingredients/ingredients.schemas";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import {
  ingredient,
  ingredientCategory,
  recipeIngredient,
  type CostBasisUnit,
  type IngredientUnit,
} from "@/db";
import { getDb, requireUser, requireAdmin } from "./_shared";

export type PickerIngredient = {
  id: string;
  name: string;
  source: "global" | "custom";
};

export type GlobalIngredientBasePrefillData = {
  category: string | null;
  defaultUnit: IngredientUnit | null;
  costBasisUnit: CostBasisUnit;
  estimatedCentsPerBasisUnit: number | null;
  notes: string | null;
};

const PICKER_SEARCH_TAKE = 25;
const GLOBAL_BASE_SEARCH_TAKE = 25;

/**
 * Resolve a category string against the catalog. Returns the canonical name
 * or throws a validation error. Pass through null/empty → null.
 */
async function resolveCategoryFromCatalog(
  db: ReturnType<typeof getDb>,
  raw: string | undefined | null
): Promise<string | null> {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  const row = await db
    .select({ name: ingredientCategory.name })
    .from(ingredientCategory)
    .where(eq(ingredientCategory.name, t))
    .limit(1);
  if (row.length === 0) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Select a valid category from the list.",
    });
  }
  return row[0]!.name;
}

export const ingredients = {
  /**
   * Create a new user-scoped ingredient. If `baseIngredientId` is set, inherits
   * subcategory from the global base row.
   */
  create: defineAction({
    accept: "form",
    input: ingredientCreateSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const categoryResolved = await resolveCategoryFromCatalog(db, input.category);

      let subcategoryForCreate = "";
      if (input.baseIngredientId) {
        const baseRows = await db
          .select({ id: ingredient.id, subcategory: ingredient.subcategory })
          .from(ingredient)
          .where(
            and(
              eq(ingredient.id, input.baseIngredientId),
              isNull(ingredient.userId)
            )
          )
          .limit(1);
        if (baseRows.length === 0) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Select a valid global ingredient.",
          });
        }
        subcategoryForCreate = baseRows[0]!.subcategory?.trim() ?? "";
      }

      const normalizedName = normalizeIngredientName(input.name);

      // Uniqueness on (userId, normalizedName) — enforced by schema but
      // we return a friendly error rather than a SQL 2067.
      const dup = await db
        .select({ id: ingredient.id })
        .from(ingredient)
        .where(
          and(
            eq(ingredient.userId, user.id),
            eq(ingredient.normalizedName, normalizedName)
          )
        )
        .limit(1);
      if (dup.length > 0) {
        throw new ActionError({
          code: "CONFLICT",
          message: "You already have an ingredient with this name.",
        });
      }

      const [row] = await db
        .insert(ingredient)
        .values({
          userId: user.id,
          name: input.name.trim(),
          normalizedName,
          category: categoryResolved,
          subcategory: subcategoryForCreate,
          defaultUnit: input.defaultUnit ?? null,
          costBasisUnit: input.costBasisUnit,
          estimatedCentsPerBasisUnit: input.estimatedCentsPerBasisUnit ?? null,
          notes: input.notes?.trim() || null,
          baseIngredientId: input.baseIngredientId ?? null,
        })
        .returning({ id: ingredient.id });

      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create ingredient",
        });
      }
      return { id: row.id };
    },
  }),

  /**
   * Update an existing ingredient. Owner check: user's own row OR admin for
   * global (userId null) rows.
   */
  update: defineAction({
    accept: "form",
    input: ingredientUpdateSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const categoryResolved = await resolveCategoryFromCatalog(db, input.category);

      const existingRows = await db
        .select()
        .from(ingredient)
        .where(eq(ingredient.id, input.id))
        .limit(1);
      if (existingRows.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Ingredient not found.",
        });
      }
      const existing = existingRows[0]!;

      if (existing.userId === null) {
        // Admin-only for global rows
        requireAdmin(ctx);
      } else if (existing.userId !== user.id) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "You can only edit your own ingredients.",
        });
      }

      const normalizedName = normalizeIngredientName(input.name);

      // Uniqueness check, excluding the current row.
      const dupConditions = existing.userId
        ? and(
            eq(ingredient.userId, existing.userId),
            eq(ingredient.normalizedName, normalizedName),
            ne(ingredient.id, input.id)
          )
        : and(
            isNull(ingredient.userId),
            eq(ingredient.normalizedName, normalizedName),
            ne(ingredient.id, input.id)
          );
      const dup = await db
        .select({ id: ingredient.id })
        .from(ingredient)
        .where(dupConditions)
        .limit(1);
      if (dup.length > 0) {
        throw new ActionError({
          code: "CONFLICT",
          message: "Another ingredient with this name already exists.",
        });
      }

      await db
        .update(ingredient)
        .set({
          name: input.name.trim(),
          normalizedName,
          category: categoryResolved,
          defaultUnit: input.defaultUnit ?? null,
          ...(input.costBasisUnit != null && {
            costBasisUnit: input.costBasisUnit,
          }),
          estimatedCentsPerBasisUnit: input.estimatedCentsPerBasisUnit ?? null,
          notes: input.notes?.trim() || null,
          preferredDisplayUnit: input.preferredDisplayUnit,
        })
        .where(eq(ingredient.id, input.id));

      return { id: input.id };
    },
  }),

  /**
   * Delete an ingredient. Refuses if it's still referenced by any recipe —
   * the user must remove it from recipes first.
   */
  delete: defineAction({
    accept: "form",
    input: ingredientIdSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existingRows = await db
        .select()
        .from(ingredient)
        .where(eq(ingredient.id, input.id))
        .limit(1);
      if (existingRows.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Ingredient not found.",
        });
      }
      const existing = existingRows[0]!;

      if (existing.userId === null) {
        requireAdmin(ctx);
      } else if (existing.userId !== user.id) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "You can only delete your own ingredients.",
        });
      }

      const [{ n }] = await db
        .select({ n: count(recipeIngredient.id) })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.ingredientId, input.id));
      if (n > 0) {
        throw new ActionError({
          code: "CONFLICT",
          message:
            "Cannot delete: this ingredient is used in one or more recipes. Remove it from recipes first.",
        });
      }

      await db.delete(ingredient).where(eq(ingredient.id, input.id));
      return { id: input.id };
    },
  }),

  /**
   * Get-or-create an ingredient from a raw name. Used by recipe import flows
   * where a line references an ingredient that may not exist yet. Reuses
   * global rows when possible.
   */
  upsertFromName: defineAction({
    accept: "form",
    input: ingredientNameSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();
      const normalizedName = normalizeIngredientName(input.name);

      const existing = await db
        .select({ id: ingredient.id, name: ingredient.name })
        .from(ingredient)
        .where(
          and(
            eq(ingredient.normalizedName, normalizedName),
            or(isNull(ingredient.userId), eq(ingredient.userId, user.id))
          )
        )
        .limit(1);
      if (existing.length > 0) {
        return existing[0]!;
      }

      const [row] = await db
        .insert(ingredient)
        .values({
          userId: user.id,
          name: input.name.trim(),
          normalizedName,
          costBasisUnit: "G",
        })
        .returning({ id: ingredient.id, name: ingredient.name });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upsert ingredient",
        });
      }
      return row;
    },
  }),

  /**
   * Ingredient picker — searches both global and user-owned. Empty query = [].
   * Prefers user-owned first (userId DESC puts nulls last).
   */
  searchForPicker: defineAction({
    input: z.object({ query: ingredientSearchQuerySchema }),
    handler: async ({ query }, ctx): Promise<PickerIngredient[]> => {
      const user = requireUser(ctx);
      if (query.length === 0) return [];
      const db = getDb();

      const rows = await db
        .select({
          id: ingredient.id,
          name: ingredient.name,
          userId: ingredient.userId,
        })
        .from(ingredient)
        .where(
          and(
            or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
            or(
              like(ingredient.name, `%${query}%`),
              like(ingredient.normalizedName, `%${query}%`)
            )
          )
        )
        // user-owned first: in SQLite NULLs sort before non-NULLs in ASC,
        // so DESC puts non-NULL userId (user-owned) first, NULLs (global) last.
        .orderBy(desc(ingredient.userId), asc(ingredient.normalizedName))
        .limit(PICKER_SEARCH_TAKE);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        source: r.userId === null ? ("global" as const) : ("custom" as const),
      }));
    },
  }),

  /** Global-only search for "create custom from global base". */
  searchGlobalForBase: defineAction({
    input: z.object({ query: ingredientSearchQuerySchema }),
    handler: async ({ query }, ctx): Promise<PickerIngredient[]> => {
      requireUser(ctx);
      if (query.length === 0) return [];
      const db = getDb();

      const rows = await db
        .select({ id: ingredient.id, name: ingredient.name })
        .from(ingredient)
        .where(
          and(
            isNull(ingredient.userId),
            or(
              like(ingredient.name, `%${query}%`),
              like(ingredient.normalizedName, `%${query}%`)
            )
          )
        )
        .orderBy(asc(ingredient.normalizedName))
        .limit(GLOBAL_BASE_SEARCH_TAKE);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        source: "global" as const,
      }));
    },
  }),

  /** Load field values from a global ingredient to prefill the create form. */
  getGlobalBasePrefill: defineAction({
    input: globalIngredientByIdSchema,
    handler: async (input, ctx): Promise<GlobalIngredientBasePrefillData> => {
      requireUser(ctx);
      const db = getDb();
      const rows = await db
        .select({
          category: ingredient.category,
          defaultUnit: ingredient.defaultUnit,
          costBasisUnit: ingredient.costBasisUnit,
          estimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit,
          notes: ingredient.notes,
        })
        .from(ingredient)
        .where(and(eq(ingredient.id, input.id), isNull(ingredient.userId)))
        .limit(1);
      if (rows.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Global ingredient not found.",
        });
      }
      return rows[0]!;
    },
  }),
};
