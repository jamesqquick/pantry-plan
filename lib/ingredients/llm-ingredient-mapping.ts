import "server-only";
import { z } from "zod";
import OpenAI from "openai";
import { logLlmRequest } from "@/lib/log-llm";

export type UnmappedLine = { originalIndex: number; text: string };

export type CatalogEntry = { id: string; normalizedName: string; name: string };

const llmResponseSchema = z.object({
  mappings: z.array(
    z.object({
      lineIndex: z.number().int().min(0),
      ingredientId: z.string().min(1).optional(),
      createName: z.string().min(1).max(500).optional(),
    })
  ),
});

type LlmMapping = z.infer<typeof llmResponseSchema>["mappings"][number];

export type LlmSuggestion = { ingredientId: string } | { createName: string };

/**
 * Call LLM to suggest ingredient mappings for lines that could not be matched
 * by exact/alias/fuzzy. Returns a Map keyed by original line index.
 * On parse/validation/API failure returns empty Map (caller leaves lines unmapped).
 * Caller may pass a pre-filtered candidate catalog (e.g. union of fuzzy candidates
 * per unmapped line) to reduce tokens; catalog is capped at 500 in the prompt.
 */
export async function suggestMappingsWithLLM(
  unmappedLines: UnmappedLine[],
  catalog: CatalogEntry[]
): Promise<Map<number, LlmSuggestion>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || unmappedLines.length === 0 || catalog.length === 0) {
    return new Map();
  }

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const linesText = unmappedLines
    .map((l, i) => `Line ${i}: ${l.text}`)
    .join("\n");
  const catalogText = catalog
    .slice(0, 500)
    .map((c) => `${c.id}\t${c.normalizedName}`)
    .join("\n");

  const prompt = `Map each ingredient line to a known ingredient or suggest a new name.

Unmapped ingredient lines (lineIndex is 0-based index into this list):
${linesText}

Known ingredients (id, normalized name; use ingredientId only if the line clearly refers to this ingredient):
${catalogText}

Return a JSON object with a single key "mappings": an array of objects. Each object must have:
- lineIndex (number): 0-based index into the unmapped lines above
- ingredientId (string, optional): UUID from the known ingredients list when the line matches one
- createName (string, optional): display name for a new ingredient when no known ingredient fits

Use createName only when the line clearly does not match any known ingredient. Return only one of ingredientId or createName per mapping. Return only the JSON object, no markdown.`;

  const startTime = Date.now();
  const model = "gpt-4o-mini";
  let rawContent: string;
  let completion: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;
  try {
    const openai = new OpenAI({ apiKey });
    completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2048,
    });
    rawContent = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logLlmRequest({
      context: "ingredient-mapping",
      model,
      success: false,
      durationMs,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    return new Map();
  }

  const durationMs = Date.now() - startTime;
  logLlmRequest({
    context: "ingredient-mapping",
    model,
    success: true,
    durationMs,
    usage: completion.usage ?? undefined,
  });

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

  for (const m of parsedSchema.data.mappings as LlmMapping[]) {
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
