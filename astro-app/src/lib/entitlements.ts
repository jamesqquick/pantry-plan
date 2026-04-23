/**
 * Feature gating for AI-backed features (image import, ingredient mapping).
 *
 * Phase 12 strategy:
 *   - Workers AI (via env.AI binding) is the primary provider — always
 *     available on Cloudflare Workers, no API key needed.
 *   - OpenAI is the fallback — only used when Workers AI fails AND
 *     OPENAI_API_KEY is set.
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
 * Whether OpenAI can be used as a fallback provider.
 * Checks that the secret is set and non-empty.
 */
export function canUseOpenAi(openaiKey: string | undefined | null): boolean {
  return !!openaiKey && openaiKey.trim().length > 0;
}

/**
 * Whether any AI provider is available for LLM features.
 * Workers AI is preferred; OpenAI is the fallback.
 */
export function canUseLlmForRecipeParse(
  _userId: string,
  ai: unknown,
  openaiKey?: string | undefined | null,
): boolean {
  return canUseWorkersAi(ai) || canUseOpenAi(openaiKey);
}
