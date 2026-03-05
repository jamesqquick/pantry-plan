/**
 * Stub for LLM/feature gating. Currently checks env only.
 * Will be replaced by subscription/entitlement logic later.
 */

/**
 * Whether the user may use the LLM for URL recipe parse (full recipe + structured ingredients).
 * Initial implementation: true when OPENAI_API_KEY is set. No subscription/plan checks yet.
 */
export function canUseLlmForRecipeParse(_userId: string): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}
