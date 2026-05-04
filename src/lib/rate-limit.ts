/**
 * Helpers around Cloudflare's RateLimit binding (env.AI_RATE_LIMIT, etc.).
 *
 * Rate-limit counters are per-Cloudflare-PoP and eventually consistent
 * across regions, so the limit is a soft throttle rather than a hard
 * cap. A single user may briefly exceed the configured limit by hitting
 * multiple PoPs within the window. For our use case (preventing abuse
 * of expensive Workers AI calls) this is acceptable.
 *
 * If the binding is undefined (e.g. local `wrangler dev` without a
 * configured ratelimit binding, or test runs), the helper allows the
 * request through. Production deployments MUST have the binding
 * configured in wrangler.jsonc.
 */

import { ActionError } from "astro:actions";

/**
 * Enforce a rate limit using the supplied binding and key. If the
 * limit is exceeded, throws an Astro ActionError with code
 * TOO_MANY_REQUESTS that surfaces a friendly message to the user.
 *
 * @param binding   The RateLimit binding (e.g. env.AI_RATE_LIMIT). May
 *                  be undefined in local dev.
 * @param key       Unique key (typically the user id, optionally
 *                  combined with a route discriminator).
 * @param errorMsg  Message to show when the limit is exceeded.
 */
export async function enforceRateLimit(
  binding: RateLimit | undefined,
  key: string,
  errorMsg = "You're making requests too quickly. Please wait a moment and try again.",
): Promise<void> {
  if (!binding) return; // Local dev / missing binding: allow through.

  const { success } = await binding.limit({ key });
  if (!success) {
    throw new ActionError({
      code: "TOO_MANY_REQUESTS",
      message: errorMsg,
    });
  }
}
