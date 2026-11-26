import { ALLOWED_RECIPE_IMAGE_TYPES } from "@/features/parse/parse.schemas";

export function recipeReadNotFound({ head = false, page = false } = {}) {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
  if (page) headers.set("X-Robots-Tag", "noindex");
  return new Response(head ? null : "Not found", { status: 404, headers });
}

function recipePhotoHeaders(object: R2Object) {
  const metadata = new Headers();
  object.writeHttpMetadata(metadata);
  const type = metadata.get("Content-Type");
  if (!type || !ALLOWED_RECIPE_IMAGE_TYPES.some((allowed) => allowed === type)) return null;
  return new Headers({
    "Content-Type": type,
    "Content-Length": String(object.size),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

export async function getRecipePhotoMetadata(bucket: R2Bucket, key: string) {
  const object = await bucket.head(key);
  return object ? recipePhotoHeaders(object) : null;
}

export async function serveRecipePhoto(bucket: R2Bucket, key: string, head: boolean) {
  if (head) {
    const headers = await getRecipePhotoMetadata(bucket, key);
    return headers ? new Response(null, { headers }) : recipeReadNotFound({ head });
  }

  const object = await bucket.get(key);
  if (!object) return recipeReadNotFound();
  const headers = recipePhotoHeaders(object);
  if (!headers) {
    await object.body.cancel();
    return recipeReadNotFound();
  }
  return new Response(object.body, { headers });
}
