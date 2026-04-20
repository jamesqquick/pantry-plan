/**
 * Lightweight string similarity (0–1) using token Jaccard.
 * Used as fallback when no exact or alias match for ingredient mapping.
 */
export function stringSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = intersection(ta, tb);
  const u = setUnion(ta, tb);
  return inter.size / u.size;
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
}

/** Token array for a string (same semantics as tokenSet). Used for LIKE-based candidate queries. */
export function tokenize(s: string): string[] {
  return Array.from(tokenSet(s));
}

function intersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const x of a) {
    if (b.has(x)) out.add(x);
  }
  return out;
}

function setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>(a);
  for (const x of b) out.add(x);
  return out;
}
