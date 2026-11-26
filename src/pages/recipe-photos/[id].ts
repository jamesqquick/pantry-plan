import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb, recipe } from "@/db";
import { recipePhotoKey } from "@/lib/recipes/recipe-photos";
import { recipeReadNotFound, serveRecipePhoto } from "@/lib/recipes/recipe-photo-read";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const head = request.method === "HEAD";
  const userId = locals.session?.userId;
  const id = params.id;
  if (!userId || !id || !/^[a-z0-9-]{1,100}$/.test(id)) return recipeReadNotFound({ head });

  const key = recipePhotoKey(id);
  const [owned] = await createDb(env.DB).select({ id: recipe.id }).from(recipe)
    .where(and(eq(recipe.id, id), eq(recipe.userId, userId), eq(recipe.imageStorageKey, key))).limit(1);
  return owned ? serveRecipePhoto(env.RECIPE_PHOTOS, key, head) : recipeReadNotFound({ head });
};

export const HEAD = GET;
