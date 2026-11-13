import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { recipePhotoKey } from "@/lib/recipes/recipe-photos";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id || !/^[a-z0-9-]{1,100}$/.test(id)) return new Response("Not found", { status: 404 });
  const object = await env.RECIPE_PHOTOS.get(recipePhotoKey(id));
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Cache-Control": "public, no-cache", "X-Content-Type-Options": "nosniff" });
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
};
