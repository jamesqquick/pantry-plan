/**
 * LLM ingredient mapping using Workers AI (Gemma 4 26B).
 *
 * Sends unmapped ingredient lines + a catalog of known ingredients to the
 * model and asks it to map each line to an existing ingredient or suggest
 * a new name. Returns empty Map on failure (graceful degradation).
 */

import { z } from "zod";
import { workersAiTextJson } from "./workers-ai-client";

export type UnmappedLine = {
  originalIndex: number;
  text: string;
};

export type CatalogEntry = {
  id: string;
  name: string;
  normalizedName: string;
};

export type LlmSuggestion =
  | { ingredientId: string }
  | { createName: string };

const llmResponseSchema = z.object({
  mappings: z.array(
    z.object({
      lineIndex: z.number().int().min(0),
      ingredientId: z.string().min(1).optional(),
      createName: z.string().min(1).max(500).optional(),
    }),
  ),
});

function buildPrompt(
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
): string {
  const linesText = unmappedLines
    .map((l, i) => `Line ${i}: ${l.text}`)
    .join("\n");
  const catalogText = catalog
    .slice(0, 500)
    .map((c) => `${c.id}\t${c.normalizedName}`)
    .join("\n");

  return `Map each ingredient line to a known ingredient or suggest a new name.

Unmapped ingredient lines (lineIndex is 0-based index into this list):
${linesText}

Known ingredients (id, normalized name; use ingredientId only if the line clearly refers to this ingredient):
${catalogText}

Return a JSON object with a single key "mappings": an array of objects. Each object must have:
- lineIndex (number): 0-based index into the unmapped lines above
- ingredientId (string, optional): UUID from the known ingredients list when the line matches one
- createName (string, optional): display name for a new ingredient when no known ingredient fits

Use createName only when the line clearly does not match any known ingredient. Return only one of ingredientId or createName per mapping. Return only the JSON object, no markdown.`;
}

function parseAndValidate(
  rawContent: string,
  unmappedLines: UnmappedLine[],
  catalogById: Map<string, CatalogEntry>,
): Map<number, LlmSuggestion> {
  if (!rawContent || typeof rawContent !== "string") return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch {
    return new Map();
  }

  const parsedSchema = llmResponseSchema.safeParse(parsed);
  if (!parsedSchema.success) return new Map();

  const result = new Map<number, LlmSuggestion>();
  const maxLineIndex = unmappedLines.length - 1;

  for (const m of parsedSchema.data.mappings) {
    if (m.lineIndex > maxLineIndex) continue;
    const originalIndex = unmappedLines[m.lineIndex]!.originalIndex;

    if (m.ingredientId) {
      const entry = catalogById.get(m.ingredientId);
      if (entry) {
        result.set(originalIndex, { ingredientId: entry.id });
      }
    } else if (m.createName?.trim()) {
      result.set(originalIndex, { createName: m.createName.trim() });
    }
  }

  return result;
}

/**
 * Suggest ingredient mappings using Workers AI.
 * Returns empty Map on failure (graceful degradation).
 *
 * @param ai - Workers AI binding (`env.AI`)
 * @param unmappedLines - Lines that deterministic matching couldn't resolve
 * @param catalog - Known ingredients to match against
 */
export async function suggestMappingsWithLLM(
  ai: Ai,
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
): Promise<Map<number, LlmSuggestion>> {
  if (unmappedLines.length === 0 || catalog.length === 0) {
    return new Map();
  }

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const prompt = buildPrompt(unmappedLines, catalog);

  try {
    const { response } = await workersAiTextJson(ai, prompt, {
      maxTokens: 2048,
      context: "ingredient-mapping",
    });
    return parseAndValidate(response, unmappedLines, catalogById);
  } catch (err) {
    console.warn(
      `[AI] Workers AI ingredient mapping failed: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
    return new Map();
  }
}
