import { and, asc, eq, sql } from "drizzle-orm";
import { recipe, recipeIngredient, recipeInstruction, type Db } from "@/db";
import { INGREDIENT_UNITS } from "@/lib/ingredients/units";
import { isSafeHttpUrl } from "@/lib/url";
import { isRecipeSharingEnabled } from "./recipe-sharing-flag";
import { getRecipePhotoMetadata } from "./recipe-photo-read";
import { recipePhotoKey } from "./recipe-photos";

export async function canReadPublicRecipe(slug: string | undefined, flags: Flagship | undefined) {
  return slug?.length === 24 && /^[a-z][a-z0-9]{23}$/.test(slug) && await isRecipeSharingEnabled(flags)
    ? slug
    : null;
}

function publicRecipeWhere(slug: string) {
  return and(eq(recipe.publicSlug, slug), eq(recipe.isPublic, true));
}

const hasManagedPhoto = eq(recipe.imageStorageKey, sql`${recipePhotoKey("")} || ${recipe.id}`);

function publicSourceUrl(value: string | null, appUrls: readonly URL[]): string | null {
  if (!value || !isSafeHttpUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.replace(/\.$/, "");
  // Only attribute the site. Legacy links can carry private tokens in the path.
  if (url.username || url.password || url.search || url.hash || url.pathname.startsWith("/recipe-photos/") ||
      !host.includes(".") || /^\d+(?:\.\d+){3}$/.test(host) ||
      /\.(localhost|local|internal|lan|home\.arpa|r2\.dev|r2\.cloudflarestorage\.com)$/.test(host) ||
      appUrls.some(({ hostname }) => {
        const appHost = hostname.replace(/\.$/, "");
        return host === appHost || host.endsWith(`.${appHost}`);
      })) return null;
  return url.origin;
}

export async function getPublicRecipe(db: Db, bucket: R2Bucket, slug: string, appUrls: readonly URL[]) {
  const scope = publicRecipeWhere(slug);
  const [[row], ingredients, instructions] = await db.batch([
    db.select({
      title: recipe.title,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
      sourceUrl: recipe.sourceUrl,
      imageStorageKey: sql<string | null>`case when ${hasManagedPhoto} then ${recipe.imageStorageKey} end`,
    }).from(recipe).where(scope).limit(1),
    db.select({
      displayText: recipeIngredient.displayText,
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
    }).from(recipeIngredient).innerJoin(recipe, eq(recipeIngredient.recipeId, recipe.id))
      .where(scope).orderBy(asc(recipeIngredient.sortOrder), asc(recipeIngredient.id)),
    db.select({ text: recipeInstruction.text }).from(recipeInstruction)
      .innerJoin(recipe, eq(recipeInstruction.recipeId, recipe.id))
      .where(scope).orderBy(asc(recipeInstruction.sortOrder), asc(recipeInstruction.id)),
  ]);
  if (!row) return null;

  const { imageStorageKey, sourceUrl, ...details } = row;
  const photo = imageStorageKey && await getRecipePhotoMetadata(bucket, imageStorageKey).catch(() => null);
  return {
    ...details,
    ingredients: ingredients.map(({ unit, ...line }) => ({
      ...line,
      unit: INGREDIENT_UNITS.includes(unit) ? unit : null,
    })),
    instructions: instructions.map(({ text }) => text),
    photoPath: photo ? `/r/${slug}/photo` : null,
    sourceUrl: publicSourceUrl(sourceUrl, appUrls),
  };
}

export async function getPublicRecipePhotoKey(db: Db, slug: string) {
  const [row] = await db.select({ imageStorageKey: recipe.imageStorageKey }).from(recipe)
    .where(and(publicRecipeWhere(slug), hasManagedPhoto))
    .limit(1);
  return row?.imageStorageKey ?? null;
}
