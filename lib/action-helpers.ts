import type { z } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

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
