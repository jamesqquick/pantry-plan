/**
 * Extract JSON-LD script tags from HTML and return parsed objects.
 * Does not validate structure; output is untrusted.
 */

export function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1].trim());
      results.push(Array.isArray(json) ? json : [json]);
    } catch {
      // skip invalid JSON
    }
  }
  return results.flat();
}

/** Find first graph node that looks like a Recipe (by @type). */
export function findRecipeInJsonLd(blocks: unknown[]): Record<string, unknown> | null {
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const types = Array.isArray(type) ? type : type ? [type] : [];
      if (types.some((t) => String(t).toLowerCase().includes("recipe"))) return obj;
      if (Array.isArray(obj["@graph"])) {
        for (const item of obj["@graph"]) {
          const found = visit(item);
          if (found) return found;
        }
      }
    }
    return null;
  };
  for (const block of blocks) {
    const found = visit(block);
    if (found) return found;
  }
  return null;
}
