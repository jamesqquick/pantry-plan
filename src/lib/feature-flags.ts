/**
 * Server-side feature flag helpers using Cloudflare Flagship.
 *
 * Flags are evaluated in the Worker at request time against the
 * propagated rule set. Evaluation is local (no round-trip to a central
 * server) and falls back to the default value if the binding is missing
 * or the flag is not found.
 *
 * When the Flagship binding is undefined (e.g. local `wrangler dev`
 * without a configured app, or test environments), all flags return
 * their default value.
 */

/**
 * Evaluate a boolean flag for the given user.
 *
 * @param binding   The Flagship binding (env.FLAGS). May be undefined.
 * @param flagKey   Flag key configured in the Flagship dashboard.
 * @param defaultValue Fallback when binding is missing or evaluation fails.
 * @param context   Evaluation context (email, userId, etc.) for targeting rules.
 */
export async function getBooleanFlag(
  binding: Flagship | undefined,
  flagKey: string,
  defaultValue: boolean,
  context?: { email?: string; userId?: string },
): Promise<boolean> {
  if (!binding) return defaultValue;

  const ctx: Record<string, string> = {};
  if (context?.email) ctx.email = context.email;
  if (context?.userId) ctx.userId = context.userId;

  return binding.getBooleanValue.call(binding, flagKey, defaultValue, ctx);
}
