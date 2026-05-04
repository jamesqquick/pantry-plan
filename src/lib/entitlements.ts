/**
 * Feature gating for AI-backed features (image import, ingredient mapping).
 *
 * Workers AI (via env.AI binding) is the sole provider — always available
 * on Cloudflare Workers, no API key needed.
 *
 * A future subscription/plan check can be layered in here by accepting
 * a user object.
 */

/**
 * Whether the Workers AI binding is available. On Cloudflare Workers this
 * is always true once the `ai` binding is declared in wrangler.jsonc.
 * Returns false only if the binding wasn't configured (e.g. local dev
 * without wrangler).
 */
export function canUseWorkersAi(ai: unknown): boolean {
  return ai != null && typeof ai === "object";
}

/**
 * Whether any AI provider is available for LLM features.
 */
export function canUseLlmForRecipeParse(
  _userId: string,
  ai: unknown,
): boolean {
  return canUseWorkersAi(ai);
}
