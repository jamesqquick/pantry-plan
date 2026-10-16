import type { Db } from "@/db";
import { selectIngredientsWithClef, type ClefIngredientDecision } from "@/lib/ai/clef-ingredient-mapping";
import { MAX_LINES_PER_REQUEST, suggestMappingsWithLLM } from "@/lib/ai/llm-ingredient-mapping";
import { loadVerifiedIngredientCandidates, retrieveIngredientCandidates, type IngredientCandidate, type IngredientRetrievalLine, type IngredientRetrievalResult } from "@/lib/search/ingredient-search";
import { syncPendingIngredientsForUser, type IngredientIndexWaitUntil, type IngredientSearchInstance } from "@/lib/search/ingredient-index";
import type { SuggestionItem } from "./compute-suggestions";
import { createIngredientMappingRequest, type IngredientMappingStage } from "./mapping-request";
import type { IngredientMappingSuggestionResult } from "./suggest-ingredient-mappings";

export type SemanticIngredientMappingOptions = {
  enabled: boolean;
  instance: IngredientSearchInstance | null;
  beforeRequest?: (stage: IngredientMappingStage) => Promise<void>;
  waitUntil?: IngredientIndexWaitUntil;
};

function sameCandidate(expected: IngredientCandidate, current: IngredientCandidate | undefined): boolean {
  return !!current && current.id === expected.id && current.name === expected.name && current.normalizedName === expected.normalizedName && JSON.stringify(current.aliases) === JSON.stringify(expected.aliases);
}

export async function suggestSemanticIngredientMappings(
  db: Db,
  suggestions: SuggestionItem[],
  userId: string,
  ai: Pick<Ai, "run">,
  options: SemanticIngredientMappingOptions,
): Promise<IngredientMappingSuggestionResult> {
  const { instance, waitUntil } = options;
  if (!instance) return { suggestions, aiStatus: "unavailable" };
  const startedAt = Date.now();
  const control = createIngredientMappingRequest(options.beforeRequest);
  let hadFailure = false;
  let candidateCount = 0;
  let created = 0;
  const decisionCounts: Record<ClefIngredientDecision["kind"], number> = { match: 0, none: 0, uncertain: 0, "low-confidence": 0, invalid: 0, failed: 0 };
  const lines: IngredientRetrievalLine[] = suggestions.flatMap((suggestion, originalIndex) =>
    suggestion.suggestedIngredient || !suggestion.normalizedKey.trim() ? [] : [{
      originalIndex, text: suggestion.originalLine, normalizedKey: suggestion.normalizedKey,
      fuzzyCandidateIds: suggestion.candidates?.map((candidate) => candidate.id) ?? [],
    }]);

  async function decide(phaseLines: readonly IngredientRetrievalLine[], retry = false) {
    const retrieved = await retrieveIngredientCandidates({ db, instance: instance!, request: control.run }, userId, phaseLines, retry);
    const available = phaseLines.filter((line) => {
      const result = retrieved.get(line.originalIndex)!;
      candidateCount += result.candidates.length;
      hadFailure ||= result.failed;
      suggestions[line.originalIndex]!.candidates = result.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, matchType: "semantic" }));
      return !result.failed || result.candidates.length > 0;
    });
    const decisions = await selectIngredientsWithClef(ai, available.map((line) => ({
      originalIndex: line.originalIndex, text: line.text, candidates: retrieved.get(line.originalIndex)!.candidates,
    })), control.run);
    for (const decision of decisions.values()) decisionCounts[decision.kind]++;
    const selected = [...decisions].flatMap(([index, decision]) => {
      if (decision.kind === "failed" || decision.kind === "invalid") hadFailure = true;
      if (decision.kind !== "match") return [];
      const candidate = retrieved.get(index)?.candidates.find((entry) => entry.id === decision.ingredientId);
      if (!candidate) { hadFailure = true; return []; }
      return [{ index, candidate }];
    });
    // Ownership and identity may change while the decision model is running.
    const verified = await loadVerifiedIngredientCandidates(db, userId, selected.map(({ candidate }) => candidate.id));
    for (const { index, candidate } of selected) {
      if (!sameCandidate(candidate, verified.get(candidate.id))) { hadFailure = true; continue; }
      suggestions[index]!.suggestedIngredient = { id: candidate.id, name: candidate.name, normalizedName: candidate.normalizedName, matchType: "clef" };
    }
    return { retrieved, decisions };
  }

  try {
    const first = await decide(lines);
    const retryLines = lines.filter((line) => {
      const decision = first.decisions.get(line.originalIndex);
      return !suggestions[line.originalIndex]!.suggestedIngredient && !first.retrieved.get(line.originalIndex)!.failed && (decision?.kind === "none" || decision?.kind === "low-confidence");
    }).map((line) => ({ ...line, fuzzyCandidateIds: [...new Set([...line.fuzzyCandidateIds, ...first.retrieved.get(line.originalIndex)!.candidates.map((candidate) => candidate.id)])] }));
    const second: { retrieved: Map<number, IngredientRetrievalResult>; decisions: Map<number, ClefIngredientDecision> } = retryLines.length > 0
      ? await decide(retryLines, true) : { retrieved: new Map(), decisions: new Map() };
    const newLines = retryLines.filter((line) => !suggestions[line.originalIndex]!.suggestedIngredient && !second.retrieved.get(line.originalIndex)!.failed && second.decisions.get(line.originalIndex)?.kind === "none");
    for (let offset = 0; offset < newLines.length; offset += MAX_LINES_PER_REQUEST) {
      const batch = newLines.slice(offset, offset + MAX_LINES_PER_REQUEST);
      try {
        const names = await control.run("generation", () => suggestMappingsWithLLM(ai, batch.map(({ originalIndex, text }) => ({ originalIndex, text: text.slice(0, 1_000) })), []));
        for (const [index, name] of names) {
          if (!batch.some((line) => line.originalIndex === index) || !("createName" in name) || suggestions[index]!.suggestedIngredient) continue;
          suggestions[index]!.suggestedCreateName = name.createName;
          created++;
        }
      } catch { hadFailure = true; }
    }
  } catch { hadFailure = true; }

  try {
    const ids = suggestions.flatMap((suggestion) => [...(suggestion.suggestedIngredient ? [suggestion.suggestedIngredient.id] : []), ...(suggestion.candidates?.map((candidate) => candidate.id) ?? [])]);
    const visible = await loadVerifiedIngredientCandidates(db, userId, ids);
    // Keep deterministic alias IDs stable across unrelated semantic work.
    const deterministicIds = suggestions.flatMap(({ suggestedIngredient: match }) =>
      match && match.matchType !== "clef" && visible.get(match.id)?.id !== match.id ? [match.id] : []);
    const deterministic = await loadVerifiedIngredientCandidates(db, userId, deterministicIds, "preserve-id");
    for (const suggestion of suggestions) {
      const match = suggestion.suggestedIngredient;
      if (match) {
        const current = match.matchType === "clef" ? visible.get(match.id) : deterministic.get(match.id) ?? visible.get(match.id);
        if (!current || current.id !== match.id || current.name !== match.name || current.normalizedName !== match.normalizedName) {
          delete suggestion.suggestedIngredient;
          hadFailure = true;
        }
      }
      suggestion.candidates = suggestion.candidates?.flatMap((candidate) => {
        const current = visible.get(candidate.id);
        return current?.id === candidate.id ? [{ ...candidate, name: current.name }] : [];
      });
    }
  } catch {
    hadFailure = true;
    for (const suggestion of suggestions) { delete suggestion.suggestedIngredient; suggestion.candidates = []; }
  }

  if (waitUntil && control.counts.search > 0) {
    try {
      waitUntil(syncPendingIngredientsForUser({ db, instance, waitUntil }, userId).catch(() => {
        console.error(JSON.stringify({ event: "ingredient_mapping_backfill", success: false }));
      }));
    } catch { /* Triggers retain dirty state if background work cannot be queued. */ }
  }
  const accepted = suggestions.filter((suggestion) => suggestion.suggestedIngredient?.matchType === "clef").length;
  console.info(JSON.stringify({ event: "ingredient_mapping_summary", durationMs: Date.now() - startedAt, unresolved: lines.length, candidates: candidateCount, accepted, newNames: created, decisions: decisionCounts, failed: hadFailure, requests: control.counts }));
  return { suggestions, aiStatus: hadFailure ? "failed" : "succeeded" };
}
