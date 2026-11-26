import { ActionError, defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { recipe, type Db } from "@/db";
import { recipeIdSchema } from "@/features/recipes/recipes.schemas";
import { isRecipeSharingEnabled } from "@/lib/recipes/recipe-sharing-flag";
import { getDb, requireUser, throwNotFound } from "./_shared";
import { withSafeActionError } from "./action-error";

const MAX_PUBLISH_ATTEMPTS = 3;
const PUBLIC_SLUG_CONFLICT = /^(?:D1_ERROR: )?UNIQUE constraint failed: Recipe\.publicSlug(?:: SQLITE_CONSTRAINT(?:_UNIQUE| \(extended: SQLITE_CONSTRAINT_UNIQUE\))?)?$/;
const sharingInput = recipeIdSchema.extend({ id: recipeIdSchema.shape.id.max(100) });
type SharingRow = Pick<typeof recipe.$inferSelect, "isPublic" | "publicSlug" | "publishedAt">;

function ownedRecipe(id: string, userId: string) {
  return and(eq(recipe.id, id), eq(recipe.userId, userId));
}

function selectSharingRow(db: Db, id: string, userId: string) {
  return db.select({
    isPublic: recipe.isPublic,
    publicSlug: recipe.publicSlug,
    publishedAt: recipe.publishedAt,
  }).from(recipe).where(ownedRecipe(id, userId));
}

function sharingState(row: SharingRow, origin?: string) {
  return {
    isPublic: row.isPublic,
    publicSlug: row.publicSlug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publicUrl: row.isPublic && row.publicSlug !== null
      ? new URL(`/r/${encodeURIComponent(row.publicSlug)}`, origin ?? new URL(env.AUTH_URL).origin).href
      : null,
  };
}

function isPublicSlugConflict(error: unknown): boolean {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    if (PUBLIC_SLUG_CONFLICT.test(error.message)) return true;
    seen.add(error);
    error = error.cause;
  }
  return false;
}

async function setVisibility(db: Db, id: string, userId: string, isPublic: boolean) {
  const publishedAt = Date.now();
  for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
    const update = db.update(recipe).set(isPublic ? {
      isPublic: true,
      publicSlug: sql`coalesce(${recipe.publicSlug}, ${createId()})`,
      publishedAt: sql`coalesce(${recipe.publishedAt}, ${publishedAt})`,
    } : { isPublic: false })
      .where(and(ownedRecipe(id, userId), eq(recipe.isPublic, !isPublic)))
      .returning({ id: recipe.id });

    try {
      // Read in the same D1 transaction so the response also describes a no-op
      // at the time it happened, even if a later request flips visibility again.
      const [updated, [row]] = await db.batch([update, selectSharingRow(db, id, userId)]);
      if (!row) throwNotFound("Recipe not found.");
      return { row, changed: updated.length > 0 };
    } catch (error) {
      if (!isPublic || !isPublicSlugConflict(error)) throw error;
    }
  }
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Could not create a sharing link. Please try again.",
  });
}

export const recipeSharingActions = {
  getSharingState: defineAction({
    input: sharingInput,
    handler: ({ id }, ctx) => withSafeActionError("recipes.getSharingState", "Could not read recipe sharing status.", async () => {
      const user = requireUser(ctx);
      const [row] = await selectSharingRow(getDb(), id, user.id);
      if (!row) throwNotFound("Recipe not found.");
      return sharingState(row);
    }),
  }),

  publish: defineAction({
    input: sharingInput,
    handler: ({ id }, ctx) => withSafeActionError("recipes.publish", "Could not create a sharing link. Please try again.", async () => {
      const user = requireUser(ctx);
      if (!await isRecipeSharingEnabled(env.FLAGS)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Recipe sharing is unavailable." });
      }
      const origin = new URL(env.AUTH_URL).origin;
      const { row, changed } = await setVisibility(getDb(), id, user.id, true);
      return { ...sharingState(row, origin), changed };
    }),
  }),

  unpublish: defineAction({
    input: sharingInput,
    handler: ({ id }, ctx) => withSafeActionError("recipes.unpublish", "Could not unpublish the recipe. Please try again.", async () => {
      const user = requireUser(ctx);
      const { row, changed } = await setVisibility(getDb(), id, user.id, false);
      return { ...sharingState(row), changed };
    }),
  }),
};
