import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/url";

/**
 * Max size for recipe image upload (4 MB). Enforced both client-side (in
 * ImportImageTab) and server-side (Zod refinement on parse.parseFromImage).
 * Astro action body limit is 5 MB in astro.config.mjs to give room for
 * multipart/form-data envelope overhead.
 */
export const MAX_RECIPE_IMAGE_BYTES = 4 * 1024 * 1024;

export const ALLOWED_RECIPE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * Validates a single image file for recipe OCR. Returns an error message or null if valid.
 * Use in parseRecipeFromImageAction after reading the file from FormData.
 */
export function validateRecipeImageFile(file: File | null): string | null {
  if (!file || file.size === 0) return "Please upload an image.";
  if (file.size > MAX_RECIPE_IMAGE_BYTES) return "Image must be 4 MB or smaller.";
  if (!ALLOWED_RECIPE_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_RECIPE_IMAGE_TYPES)[number])) {
    return "Image must be JPEG, PNG, or WebP.";
  }
  return null;
}

export const parseUrlSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .refine(isSafeHttpUrl, "Only http and https URLs are allowed")
    .refine(
      (u) => {
        try {
          const host = new URL(u).hostname.toLowerCase();
          if (host === "localhost" || host.endsWith(".localhost")) return false;
          if (["127.0.0.1", "0.0.0.0", "::1"].includes(host)) return false;
          if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false;
          return true;
        } catch {
          return false;
        }
      },
      { message: "URL not allowed (localhost or private network)" }
    ),
});

export type ParseUrlInput = z.infer<typeof parseUrlSchema>;
