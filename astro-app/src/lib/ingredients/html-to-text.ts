/**
 * Parse a string as HTML and return plain text (strip tags, decode entities).
 * Used so ingredient lines that contain HTML (e.g. from scraped recipes) are
 * normalized to plain text before parsing quantity/unit/name.
 */
export function htmlToText(html: string): string {
  if (typeof html !== "string") return "";
  let s = html;

  // Strip HTML tags: replace <...> with space, then collapse whitespace
  s = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  // Decode common named entities (order matters: &amp; first)
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  for (const [entity, char] of Object.entries(entities)) {
    s = s.split(entity).join(char);
  }

  // Decode numeric decimal entities (e.g. &#8217;)
  s = s.replace(/&#(\d+);/g, (_, code) => {
    const n = parseInt(code, 10);
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : `&#${code};`;
  });
  // Decode numeric hex entities (e.g. &#x2019;)
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const n = parseInt(code, 16);
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : `&#x${code};`;
  });

  return s.replace(/\s+/g, " ").trim();
}
