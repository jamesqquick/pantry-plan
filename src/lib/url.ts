/**
 * URL safety helpers.
 *
 * These guard against stored XSS via dangerous URL schemes. Any time a URL
 * string is stored on a record and later rendered into an `<a href>` or
 * `<img src>` attribute, it MUST go through `httpUrlSchema` (or
 * `isSafeHttpUrl`) at write time. Browsers execute `javascript:` URLs as
 * code when used as link hrefs, and `data:text/html,...` URLs as
 * documents — both can run attacker-supplied script in the rendering
 * user's origin.
 *
 * `z.string().url()` alone is NOT sufficient: it accepts any
 * URL-parseable string, including `javascript:alert(1)`, `data:...`,
 * `file:///etc/passwd`, etc.
 */

import { z } from "zod";

/**
 * Returns true iff the URL parses as an absolute http(s) URL.
 *
 * Rejects: relative paths, javascript:, data:, file:, mailto:, ftp:,
 * vbscript:, and anything else that isn't http/https.
 */
export function isSafeHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Zod schema for a required HTTP/HTTPS URL.
 *
 * Use this anywhere a user-supplied URL will be rendered as `<a href>` or
 * `<img src>` (e.g. `recipe.sourceUrl`, `recipe.imageUrl`).
 */
export const httpUrlSchema = z
  .string()
  .min(1, "URL is required")
  .refine(isSafeHttpUrl, "Only http and https URLs are allowed");

/**
 * Zod schema for an optional HTTP/HTTPS URL. Accepts an empty string as
 * "no URL provided" so existing form serialization (which submits empty
 * inputs as "") keeps working.
 */
export const optionalHttpUrlSchema = z
  .string()
  .optional()
  .refine(
    (value) => value === undefined || value === "" || isSafeHttpUrl(value),
    "Only http and https URLs are allowed",
  );
