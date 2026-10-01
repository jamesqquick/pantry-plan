/**
 * LLM ingredient mapping using Workers AI.
 *
 * Sends unmapped ingredient lines + a catalog of known ingredients to the
 * model and asks it to map each line to an existing ingredient or suggest
 * a new name. The orchestration layer handles graceful degradation.
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

const llmResponseSchema = z
  .object({
    mappings: z.array(z.unknown()),
  })
  .strict();

const llmMappingSchema = z
  .object({
    lineIndex: z.number().int(),
    catalogIndex: z.number().int(),
    createName: z.string().trim().max(500),
  })
  .strict();

type LlmMapping = z.infer<typeof llmMappingSchema>;

type MappingDiagnostics = {
  invalidMappings: number;
  outOfRangeIndexes: number;
  outOfRangeCatalogIndexes: number;
};

function logMappingDiagnostics(diagnostics: MappingDiagnostics): void {
  if (Object.values(diagnostics).every((count) => count === 0)) return;

  console.warn(
    `[AI] Workers AI ingredient mapping response contained unusable entries: invalidMappings=${diagnostics.invalidMappings} outOfRangeIndexes=${diagnostics.outOfRangeIndexes} outOfRangeCatalogIndexes=${diagnostics.outOfRangeCatalogIndexes}`,
  );
}

function addMapping(
  result: Map<number, LlmSuggestion>,
  mapping: LlmMapping,
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
  diagnostics: MappingDiagnostics,
): void {
  const line = unmappedLines[mapping.lineIndex];
  if (!line) {
    diagnostics.outOfRangeIndexes += 1;
    return;
  }

  if (mapping.catalogIndex === -1) {
    if (!mapping.createName) {
      diagnostics.invalidMappings += 1;
      return;
    }
    result.set(line.originalIndex, { createName: mapping.createName });
    return;
  }

  const entry = catalog[mapping.catalogIndex];
  if (!entry) {
    diagnostics.outOfRangeCatalogIndexes += 1;
    return;
  }

  if (mapping.createName) {
    diagnostics.invalidMappings += 1;
    return;
  }

  result.set(line.originalIndex, { ingredientId: entry.id });
}

function buildLlmResponseJsonSchema(lineCount: number, catalogCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      mappings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            lineIndex: {
              type: "integer",
              minimum: 0,
              maximum: lineCount - 1,
            },
            catalogIndex: {
              type: "integer",
              minimum: -1,
              maximum: Math.max(catalogCount - 1, -1),
            },
            createName: { type: "string", maxLength: 500 },
          },
          required: ["lineIndex", "catalogIndex", "createName"],
        },
      },
    },
    required: ["mappings"],
  } as const;
}

const MAX_LINES_PER_REQUEST = 40;

class LlmMappingResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmMappingResponseError";
  }
}

function buildPrompt(
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
): string {
  const linesText = unmappedLines
    .map((l, i) => `Line ${i}: ${l.text}`)
    .join("\n");
  const catalogText = catalog
    .map((entry, index) => `Catalog ${index}: ${entry.normalizedName}`)
    .join("\n") || "(none)";

  return `Map each ingredient line to a known ingredient or suggest a new name.

Unmapped ingredient lines (lineIndex is 0-based index into this list):
${linesText}

Known ingredients:
${catalogText}

Return a JSON object with a single key "mappings": an array of objects. Each object must have:
- lineIndex (number): 0-based index into the unmapped lines above
- catalogIndex (number): the matching Catalog index, or -1 when no known ingredient matches
- createName (string): an empty string when catalogIndex is 0 or greater, or a concise non-empty display name when catalogIndex is -1

Use a Catalog index only when the line clearly matches that known ingredient. Use -1 and createName when no known ingredient fits. Return one mapping per line and only the JSON object, with no markdown.`;
}

function parseAndValidate(
  rawContent: string,
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
): Map<number, LlmSuggestion> {
  if (!rawContent || typeof rawContent !== "string") {
    throw new LlmMappingResponseError(
      "Workers AI did not return a valid JSON response.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch {
    throw new LlmMappingResponseError(
      "Workers AI did not return valid JSON.",
    );
  }

  const parsedSchema = llmResponseSchema.safeParse(parsed);
  if (!parsedSchema.success) {
    throw new LlmMappingResponseError(
      "Workers AI returned an invalid ingredient mapping response.",
    );
  }

  const result = new Map<number, LlmSuggestion>();
  const diagnostics: MappingDiagnostics = {
    invalidMappings: 0,
    outOfRangeIndexes: 0,
    outOfRangeCatalogIndexes: 0,
  };

  for (const rawMapping of parsedSchema.data.mappings) {
    const mapping = llmMappingSchema.safeParse(rawMapping);
    if (!mapping.success) {
      diagnostics.invalidMappings += 1;
      continue;
    }
    addMapping(
      result,
      mapping.data,
      unmappedLines,
      catalog,
      diagnostics,
    );
  }

  logMappingDiagnostics(diagnostics);

  if (unmappedLines.length > 0 && result.size === 0) {
    throw new LlmMappingResponseError(
      "Workers AI returned no usable ingredient mappings.",
    );
  }

  return result;
}

/**
 * Suggest ingredient mappings using Workers AI.
 * @param ai - Workers AI binding (`env.AI`)
 * @param unmappedLines - Lines that deterministic matching couldn't resolve
 * @param catalog - Known ingredients to match against
 */
export async function suggestMappingsWithLLM(
  ai: Ai,
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[],
  beforeRequest?: () => Promise<void>,
): Promise<Map<number, LlmSuggestion>> {
  if (unmappedLines.length === 0) {
    return new Map();
  }

  const result = new Map<number, LlmSuggestion>();

  for (let offset = 0; offset < unmappedLines.length; offset += MAX_LINES_PER_REQUEST) {
    const batch = unmappedLines.slice(offset, offset + MAX_LINES_PER_REQUEST);
    const prompt = buildPrompt(batch, catalog);
    await beforeRequest?.();
    const { response } = await workersAiTextJson(ai, prompt, {
      maxTokens: 2048,
      context: "ingredient-mapping",
      jsonSchema: buildLlmResponseJsonSchema(batch.length, catalog.length),
    });

    for (const [index, suggestion] of parseAndValidate(
      response,
      batch,
      catalog,
    )) {
      result.set(index, suggestion);
    }
  }

  return result;
}
