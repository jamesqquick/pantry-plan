import "server-only";
import OpenAI from "openai";
import { logLlmRequest } from "@/lib/log-llm";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import {
  urlToStructuredRecipeResponseSchema,
  type StructuredItemFromParse,
  type UrlToStructuredRecipeResponse,
} from "@/features/import/url-to-structured-recipe.schemas";
import type { IngredientUnit } from "@prisma/client";

export type LineWithCandidates = {
  lineIndex: number;
  rawLine: string;
  candidates: Array<{ id: string; name: string }>;
};

export type DraftForStructured = {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  ingredients: string[];
  instructions: string[];
  notes?: string;
};

/**
 * Call OpenAI to map a URL-parsed draft + per-line candidates into a full recipe
 * and structured ingredient rows. The model may adjust any field (instructions,
 * times, quantities, units, mapping). Validate all output; verify ingredientId
 * against the allowed candidates for that line.
 * On missing key, API error, or validation failure returns { ok: false, error }.
 */
export async function mapUrlDraftToStructured(
  draft: DraftForStructured,
  linesWithCandidates: LineWithCandidates[]
): Promise<
  | { ok: true; recipe: UrlToStructuredRecipeResponse; structuredItems: StructuredItemFromParse[] }
  | { ok: false; error: string }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not set" };
  }

  const ingredientsBlock = linesWithCandidates
    .map(
      (l) =>
        `Line ${l.lineIndex}: "${l.rawLine}"\n  Candidates (id, name): ${l.candidates.length === 0 ? "none" : l.candidates.map((c) => `${c.id}: ${c.name}`).join("; ")}`
    )
    .join("\n\n");

  const prompt = `You are given a recipe parsed from a URL (title, metadata, instructions, notes, and raw ingredient lines). For each ingredient line we also provide candidate ingredients (id and name) from the user's catalog. Your task is to return the full recipe with any corrections you think are needed, and for each ingredient line return a structured row: quantity, unit, displayText (ingredient part without qty/unit), rawText (full line), and either ingredientId (must be one of the candidate ids for that line) or suggestedCreateName (if no candidate fits).

Recipe from URL:
Title: ${draft.title}
Source URL: ${draft.sourceUrl}
${draft.imageUrl ? `Image: ${draft.imageUrl}` : ""}
Servings: ${draft.servings ?? "—"}
Prep time (minutes): ${draft.prepTimeMinutes ?? "—"}
Cook time (minutes): ${draft.cookTimeMinutes ?? "—"}
Total time (minutes): ${draft.totalTimeMinutes ?? "—"}
Instructions:
${(draft.instructions ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}
${draft.notes ? `Notes: ${draft.notes}` : ""}

Ingredient lines with candidates:
${ingredientsBlock}

Return a single JSON object with:
- title (string)
- sourceUrl (string, optional)
- imageUrl (string, optional)
- servings (number, optional)
- prepTimeMinutes (number, optional)
- cookTimeMinutes (number, optional)
- totalTimeMinutes (number, optional)
- instructions (array of strings)
- notes (string, optional)
- structuredIngredients: array of { sortOrder (0-based), quantity (number or null), unit (string: count, tsp, tbsp, cup, oz, lb, g, kg, or null), displayText, rawText, ingredientId (optional, must be from candidates for that line), suggestedCreateName (optional) }
Each structured ingredient must have either ingredientId (from the candidates for that sortOrder) or suggestedCreateName, not both. Use ingredientId only when the line clearly matches a candidate. Return only the JSON object, no markdown.`;

  const model = "gpt-4o-mini";
  const startTime = Date.now();
  let rawContent: string;
  let completion: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;

  try {
    const openai = new OpenAI({ apiKey });
    completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    });
    rawContent = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logLlmRequest({
      context: "map-url-draft-to-structured",
      model,
      success: false,
      durationMs,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "OpenAI request failed",
    };
  }

  const durationMs = Date.now() - startTime;
  logLlmRequest({
    context: "map-url-draft-to-structured",
    model,
    success: true,
    durationMs,
    usage: completion.usage ?? undefined,
  });

  if (!rawContent || typeof rawContent !== "string") {
    return { ok: false, error: "Empty or invalid response" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in response" };
  }

  const parsedSchema = urlToStructuredRecipeResponseSchema.safeParse(parsed);
  if (!parsedSchema.success) {
    return {
      ok: false,
      error: `Validation failed: ${parsedSchema.error.message}`,
    };
  }

  const data = parsedSchema.data;
  const candidateIdsByLine = new Map<number, Set<string>>();
  const candidateNameById = new Map<string, string>();
  for (const l of linesWithCandidates) {
    const ids = new Set(l.candidates.map((c) => c.id));
    candidateIdsByLine.set(l.lineIndex, ids);
    for (const c of l.candidates) {
      candidateNameById.set(c.id, c.name);
    }
  }

  const structuredItems: StructuredItemFromParse[] = [];
  for (const row of data.structuredIngredients) {
    const allowedIds = candidateIdsByLine.get(row.sortOrder);
    let ingredientId: string | undefined;
    let ingredientName: string | undefined;
    if (row.ingredientId) {
      if (allowedIds && allowedIds.has(row.ingredientId)) {
        ingredientId = row.ingredientId;
        ingredientName = candidateNameById.get(row.ingredientId) ?? undefined;
      }
      // else: LLM returned an id not in candidates; drop it (treat as unmapped)
    }
    const unit: IngredientUnit | null =
      row.unit != null && row.unit !== ""
        ? UNIT_FROM_LABEL[String(row.unit).toLowerCase().trim()] ?? null
        : null;
    const quantity =
      row.quantity != null && Number.isFinite(row.quantity) ? row.quantity : null;
    structuredItems.push({
      sortOrder: row.sortOrder,
      quantity,
      unit,
      displayText: row.displayText,
      rawText: row.rawText,
      ...(ingredientId != null && { ingredientId, ingredientName }),
      ...(row.suggestedCreateName != null &&
        row.suggestedCreateName.trim() !== "" && {
          suggestedCreateName: row.suggestedCreateName.trim(),
        }),
    });
  }

  return {
    ok: true,
    recipe: data,
    structuredItems,
  };
}
