/**
 * Display form of a tag name. Tags are free-text (often lowercase from
 * imports), so capitalize the first letter of each word without touching
 * the rest — "one-pot dinner" → "One-pot Dinner", "BBQ" stays "BBQ".
 */
export function formatTagName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}
