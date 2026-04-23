/**
 * LLM ingredient mapping — Workers AI primary, OpenAI fallback.
 *
 * Flow:
 *   1. Try Llama 4 Scout via Workers AI (text + JSON mode)
 *   2. If that fails and OPENAI_API_KEY is set, fall back to OpenAI
 *   3. If both fail, return empty Map (graceful degradation)
 *
 * Reuses the same types as the OpenAI-only module for drop-in compatibility.
 */

import { z } from "zod";
import { workersAiTextJson } from "./workers-ai-client";
import {
  suggestMappingsWithLLM as suggestMappingsOpenAI,
  type UnmappedLine,
  type CatalogEntry,
  type LlmSuggestion,
} from "@/lib/ingredients/llm-ingredient-mapping";
import { canUseOpenAi } from "@/lib/entitlements";

export type { UnmappedLine, CatalogEntry, LlmSuggestion };

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
 * Suggest ingredient mappings — Workers AI first, OpenAI fallback.
 * Returns empty Map on total failure (graceful degradation).
 *
 * @param ai - Workers AI binding (`env.AI`)
 * @param unmappedLines - Lines that deterministic matching couldn't resolve
 * @param catalog - Known ingredients to match against
 * @param openaiApiKey - Optional OpenAI key for fallback
 */
export async function suggestMappingsWithLLM(
  ai: Ai,
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
  openaiApiKey?: string | null,
): Promise<Map<number, LlmSuggestion>> {
  if (unmappedLines.length === 0 || catalog.length === 0) {
    return new Map();
  }

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const prompt = buildPrompt(unmappedLines, catalog);

  // --- Workers AI primary ---
  try {
    const { response } = await workersAiTextJson(ai, prompt, {
      maxTokens: 2048,
      context: "ingredient-mapping",
    });
    const result = parseAndValidate(response, unmappedLines, catalogById);
    if (result.size > 0) return result;
    // If Workers AI returned valid JSON but no usable mappings, still try fallback
  } catch (err) {
    console.warn(
      `[AI] Workers AI ingredient mapping failed, will attempt fallback: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
  }

  // --- OpenAI fallback ---
  if (canUseOpenAi(openaiApiKey)) {
    console.info("[AI] Falling back to OpenAI for ingredient mapping.");
    return suggestMappingsOpenAI(unmappedLines, catalog, openaiApiKey);
  }

  return new Map();
}
