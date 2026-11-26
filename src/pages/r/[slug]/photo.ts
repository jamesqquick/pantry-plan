import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "@/db";
import { canReadPublicRecipe, getPublicRecipePhotoKey } from "@/lib/recipes/public-recipe";
import { recipeReadNotFound, serveRecipePhoto } from "@/lib/recipes/recipe-photo-read";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const head = request.method === "HEAD";
  const slug = await canReadPublicRecipe(params.slug, env.FLAGS);
  if (!slug) return recipeReadNotFound({ head });
  const key = await getPublicRecipePhotoKey(createDb(env.DB), slug);
  return key ? serveRecipePhoto(env.RECIPE_PHOTOS, key, head) : recipeReadNotFound({ head });
};

export const HEAD = GET;
