import { and, eq } from "drizzle-orm";
import { recipe, type Db } from "@/db";
import {
  ALLOWED_RECIPE_IMAGE_TYPES,
  MAX_RECIPE_IMAGE_BYTES,
  validateRecipeImageFile,
} from "@/features/parse/parse.schemas";

export class RecipePhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipePhotoValidationError";
  }
}

export const recipePhotoKey = (recipeId: string) => `recipe-photos/${recipeId}`;
export type RecipePhotoStorage = { bucket: R2Bucket; publicUrl?: string };

export function recipePhotoUrl(recipeId: string, publicUrl?: string) {
  const path = recipePhotoKey(recipeId);
  const base = publicUrl?.replace(/\/$/, "") ?? "";
  return `${base}/${path}?v=${crypto.randomUUID()}`;
}

function verifiedType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function validatePhotoBytes(bytes: Uint8Array, contentType: string): void {
  if (!bytes.length || bytes.length > MAX_RECIPE_IMAGE_BYTES) {
    throw new RecipePhotoValidationError("Image must be 4 MB or smaller.");
  }
  if (!ALLOWED_RECIPE_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_RECIPE_IMAGE_TYPES)[number]) || verifiedType(bytes) !== contentType) {
    throw new RecipePhotoValidationError("Image must be a valid JPEG, PNG, or WebP file.");
  }
}

export async function putRecipePhoto(bucket: R2Bucket, recipeId: string, bytes: Uint8Array, contentType: string): Promise<void> {
  validatePhotoBytes(bytes, contentType);
  await bucket.put(recipePhotoKey(recipeId), bytes, { httpMetadata: { contentType, cacheControl: "public, no-cache" } });
}

export async function storeRecipePhoto(
  db: Db,
  bucket: R2Bucket,
  userId: string,
  recipeId: string,
  bytes: Uint8Array,
  contentType: string,
  publicUrl?: string,
): Promise<string> {
  validatePhotoBytes(bytes, contentType);
  const [owned] = await db.select({ id: recipe.id, imageStorageKey: recipe.imageStorageKey }).from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.userId, userId))).limit(1);
  if (!owned) throw new RecipePhotoValidationError("Recipe not found.");

  const key = recipePhotoKey(recipeId);
  const previous = owned.imageStorageKey ? await bucket.get(key) : null;
  await putRecipePhoto(bucket, recipeId, bytes, contentType);
  const imageUrl = recipePhotoUrl(recipeId, publicUrl);
  try {
    const updated = await db.update(recipe).set({ imageUrl, imageStorageKey: key })
      .where(and(eq(recipe.id, recipeId), eq(recipe.userId, userId))).returning({ id: recipe.id });
    if (updated.length === 0) throw new RecipePhotoValidationError("Recipe not found.");
  } catch (error) {
    if (previous) {
      await bucket.put(key, previous.body, { httpMetadata: previous.httpMetadata });
    } else {
      await removeRecipePhoto(bucket, key);
    }
    throw error;
  }
  return imageUrl;
}

export async function storeRecipePhotoFile(
  db: Db, bucket: R2Bucket, userId: string, recipeId: string, file: File, publicUrl?: string,
): Promise<string> {
  const error = validateRecipeImageFile(file);
  if (error) throw new RecipePhotoValidationError(error);
  return storeRecipePhoto(db, bucket, userId, recipeId, new Uint8Array(await file.arrayBuffer()), file.type, publicUrl);
}

export async function removeRecipePhoto(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.error(JSON.stringify({ message: "Recipe photo cleanup failed", key, error: error instanceof Error ? error.message : String(error) }));
  }
}

function allowedRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RecipePhotoValidationError("Photo source must be a public HTTPS URL.");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.startsWith("[") || /^\d+(?:\.\d+){3}$/.test(host)) {
    throw new RecipePhotoValidationError("Photo source must be a public HTTPS URL.");
  }
  return url;
}

export async function fetchRecipePhoto(sourceUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let url = allowedRemoteUrl(sourceUrl);
  const deadline = Date.now() + 15_000;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new RecipePhotoValidationError("Photo download timed out.");
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(remaining) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 3) throw new RecipePhotoValidationError("Photo redirected too many times.");
      url = allowedRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new RecipePhotoValidationError("Could not download the photo.");
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_RECIPE_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_RECIPE_IMAGE_TYPES)[number])) {
      await response.body.cancel();
      throw new RecipePhotoValidationError("Photo must be JPEG, PNG, or WebP.");
    }
    if (Number(response.headers.get("content-length")) > MAX_RECIPE_IMAGE_BYTES) {
      await response.body.cancel();
      throw new RecipePhotoValidationError("Image must be 4 MB or smaller.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RECIPE_IMAGE_BYTES) throw new RecipePhotoValidationError("Image must be 4 MB or smaller.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    validatePhotoBytes(bytes, contentType);
    return { bytes, contentType };
  }
  throw new RecipePhotoValidationError("Photo redirected too many times.");
}
