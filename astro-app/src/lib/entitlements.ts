/**
 * Feature gating for LLM-backed features (URL parse, image import, mapping).
 *
 * Cloudflare adaptation: the original Next.js version checked
 * `process.env.OPENAI_API_KEY`. On Workers `process.env` isn't available
 * at request time — secrets live on `env`. Each caller must pass the
 * OPENAI_API_KEY string in, so this stays a pure function.
 *
 * A future subscription/plan check can be layered in here by accepting
 * a user object.
 */

export function canUseOpenAi(openaiKey: string | undefined | null): boolean {
  return !!openaiKey && openaiKey.trim().length > 0;
}

/**
 * Whether the user may use the LLM for URL recipe parse (full recipe +
 * structured ingredients). Accepts the key string; user argument is
 * reserved for future plan checks.
 */
export function canUseLlmForRecipeParse(
  _userId: string,
  openaiKey: string | undefined | null
): boolean {
  return canUseOpenAi(openaiKey);
}
