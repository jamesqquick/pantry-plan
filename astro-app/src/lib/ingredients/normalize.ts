import { INGREDIENT_SYNONYMS } from "./synonyms";
import { INGREDIENT_STOPWORDS, LEADING_DESCRIPTORS, NORMALIZE_REMOVE_WORDS } from "./stopwords";

/**
 * Normalize ingredient name for deduplication and lookup:
 * lowercase, remove parentheticals (content and parens), strip punctuation,
 * collapse whitespace, remove standalone numbers and conjunction/noise words (e.g. or, and),
 * remove descriptors (leading: e.g. organic, unsalted, extra-virgin; trailing: e.g. softened,
 * chopped, packed, room temperature), conservative singularization, and synonym substitution.
 */
export function normalizeIngredientName(line: string): string {
  let s = line.toLowerCase();

  // Remove parenthetical content including the parentheses (repeat to handle nested)
  while (/\([^()]*\)/.test(s)) {
    s = s.replace(/\([^()]*\)/g, " ");
  }
  // Remove any remaining unmatched ( or )
  s = s.replace(/[()]/g, " ");

  s = s
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove standalone numbers and conjunction/noise words (e.g. "3 milk or cream" -> "milk cream")
  const words = s
    .split(" ")
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !NORMALIZE_REMOVE_WORDS.has(w));
  // Remove leading descriptor words (e.g. "organic all purpose flour" -> "all purpose flour")
  while (words.length > 1 && LEADING_DESCRIPTORS.has(words[0])) {
    words.shift();
  }
  s = words.join(" ");

  // Remove trailing stopwords that are quantity/unit/prep (keep core name)
  const stopwordList = Array.from(INGREDIENT_STOPWORDS);
  for (const stop of stopwordList) {
    const re = new RegExp(`\\b${escapeRe(stop)}\\s*$`, "i");
    s = s.replace(re, "").trim();
  }
  s = s.replace(/\s+/g, " ").trim();

  // Conservative singularization: trailing 's' only when it's a whole word (e.g. "cloves" already removed)
  if (s.endsWith("s") && s.length > 3 && !s.endsWith("ss")) {
    const withoutS = s.slice(0, -1);
    if (!INGREDIENT_SYNONYMS[withoutS] && !INGREDIENT_SYNONYMS[s]) {
      // Prefer existing synonym form
      s = INGREDIENT_SYNONYMS[s] ?? s;
    } else {
      s = INGREDIENT_SYNONYMS[s] ?? INGREDIENT_SYNONYMS[withoutS] ?? s;
    }
  } else {
    s = INGREDIENT_SYNONYMS[s] ?? s;
  }

  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
