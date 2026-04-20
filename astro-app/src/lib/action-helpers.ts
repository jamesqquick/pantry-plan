import type { z } from "zod";

/**
 * Consistent action result shape. Mirrors the Next.js version so any
 * code ported into Astro actions doesn't have to care about the host.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };

/** Map Zod issues to fieldErrors shape expected by forms. */
export function zodToFieldErrors(
  issues: z.ZodIssue[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!map[path]) map[path] = [];
    map[path].push(issue.message);
  }
  return map;
}
