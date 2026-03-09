/**
 * Client-side fuzzy filter for recipe options.
 * - Empty query returns all options.
 * - Otherwise returns options whose title matches the query: either contains the
 *   query as a substring (case-insensitive) or contains the query characters in order.
 * Results are ordered: exact substring matches first, then fuzzy order matches.
 */

export type RecipeOption = { id: string; title: string };

function normalizedIncludes(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  return t.includes(q);
}

/** True if every character of q appears in t in order (with possible gaps). */
function fuzzyOrderMatch(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length;
}

export function fuzzyFilterRecipes(
  options: RecipeOption[],
  query: string
): RecipeOption[] {
  const trimmed = query.trim();
  if (trimmed === "") return options;

  const exact: RecipeOption[] = [];
  const fuzzy: RecipeOption[] = [];
  for (const opt of options) {
    if (normalizedIncludes(opt.title, trimmed)) {
      exact.push(opt);
    } else if (fuzzyOrderMatch(opt.title, trimmed)) {
      fuzzy.push(opt);
    }
  }
  return [...exact, ...fuzzy];
}
