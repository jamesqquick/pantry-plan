import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ingredient, ingredientAlias, user } from "@/db";
import { createTestDb } from "@/test/d1";
import { CLEF_INGREDIENT_MODEL, type ClefIngredientRequest } from "@/lib/ai/clef-ingredient-mapping";
import type { IngredientSearchInstance } from "@/lib/search/ingredient-index";
import { MAX_MAPPING_REQUESTS, type IngredientMappingStage } from "./mapping-request";
import { IngredientMappingInputError, suggestIngredientMappings } from "./suggest-ingredient-mappings";

let runtime: ReturnType<typeof createTestDb>;
let run = vi.fn();
let ai: Pick<Ai, "run">;
let search: ReturnType<typeof vi.fn<AiSearchInstance["search"]>>;
let instance: IngredientSearchInstance;

function chunk(id = "owned"): AiSearchSearchResponse["chunks"][number] {
  return { id, type: "text", score: 0.8, text: "ignored", item: { key: `ingredients/${id}.md`, metadata: { ingredient_id: id, scope_key: id === "owned" ? "user:u1" : "global" } } };
}

function decisions(payload: ClefIngredientRequest, choose: (index: number, criteria: Record<string, unknown>) => string = () => "candidate_0") {
  return { answers: Object.fromEntries(Object.entries(payload.questions).map(([key, question]) => {
    const choice = choose(Number(key.slice(5)), question.criteria);
    const keys = Object.keys(question.criteria);
    return [key, { type: "choice", choice, probabilities: Object.fromEntries(keys.map((option) => [option, option === choice ? 0.94 : 0.06 / (keys.length - 1)])), confidence: 0.9 }];
  })), usage: { input_tokens: 100, output_tokens: 10 } };
}

beforeEach(async () => {
  runtime = createTestDb();
  await runtime.db.insert(user).values([{ id: "u1", name: "One", email: "one@example.com" }, { id: "u2", name: "Two", email: "two@example.com" }]);
  await runtime.db.insert(ingredient).values([
    { id: "owned", name: "Chickpeas", normalizedName: "chickpeas", userId: "u1", costBasisUnit: "G" },
    { id: "salt", name: "Salt", normalizedName: "salt", userId: null, costBasisUnit: "G" },
    { id: "foreign", name: "Private blend", normalizedName: "private blend", userId: "u2", costBasisUnit: "G" },
  ]);
  await runtime.db.insert(ingredientAlias).values({ id: "alias", ingredientId: "salt", aliasNormalized: "sodium chloride" });
  run = vi.fn(); ai = { run };
  run.mockImplementation(async (model: string, payload: ClefIngredientRequest) => {
    if (model !== CLEF_INGREDIENT_MODEL) throw new TypeError("Unexpected generation request");
    return decisions(payload);
  });
  search = vi.fn<AiSearchInstance["search"]>(async () => ({ search_query: "q", chunks: [chunk()] }));
  instance = { search, items: { upload: vi.fn<AiSearchItems["upload"]>(), delete: vi.fn<AiSearchItems["delete"]>(), list: vi.fn<AiSearchItems["list"]>() } };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { runtime.sqlite.close(); vi.useRealTimers(); vi.restoreAllMocks(); });

function suggest(lines: string[], beforeRequest: (stage: IngredientMappingStage) => Promise<void> = vi.fn(async () => undefined)) {
  return suggestIngredientMappings(runtime.db, lines, "u1", ai, undefined, { enabled: true, instance, beforeRequest });
}

describe("semantic ingredient mapping orchestration", () => {
  it("bypasses every provider for exact and alias matches", async () => {
    const beforeRequest = vi.fn();
    const result = await suggest(["1 cup chickpeas", "1 tsp sodium chloride"], beforeRequest);
    expect(result.aiStatus).toBe("not-needed");
    expect(result.suggestions.map((row) => row.suggestedIngredient?.matchType)).toEqual(["exact", "alias"]);
    expect(search).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(beforeRequest).not.toHaveBeenCalled();
  });

  it("maps only unresolved lines, preserves ordering and parsed quantities, and sends bounded candidates", async () => {
    const stages: string[] = [];
    const result = await suggest(["1 tsp salt", "1.5 cups garbanzo beans, drained"], async (stage) => { stages.push(stage); });
    expect(result.aiStatus).toBe("succeeded");
    expect(result.suggestions[0]?.suggestedIngredient?.matchType).toBe("exact");
    expect(result.suggestions[1]).toMatchObject({ originalLine: "1.5 cups garbanzo beans, drained", parsed: { quantity: 1.5, unit: "CUP" }, suggestedIngredient: { id: "owned", matchType: "clef" } });
    expect(stages).toEqual(["search", "clef"]);
    expect(run).toHaveBeenCalledOnce();
    const payload = run.mock.calls[0]![1] as ClefIngredientRequest;
    expect(Object.keys(payload.questions)).toEqual(["line_1"]);
    expect(Object.keys(payload.questions.line_1!.criteria)).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toContain("Private blend");
  });

  it("does not fall back to the broad catalog when the search binding is disabled", async () => {
    const result = await suggestIngredientMappings(runtime.db, ["garbanzo beans"], "u1", ai, undefined, { enabled: true, instance: null });
    expect(result.aiStatus).toBe("unavailable"); expect(run).not.toHaveBeenCalled();
  });

  it("keeps deterministic matches and manual review during search outages", async () => {
    search.mockRejectedValue(new TypeError("offline"));
    const result = await suggest(["salt", "garbanzo beans"]);
    expect(result.aiStatus).toBe("failed"); expect(result.suggestions[0]?.suggestedIngredient?.id).toBe("salt");
    expect(result.suggestions[1]?.suggestedIngredient).toBeUndefined(); expect(run).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves a deterministic global alias with an owned name duplicate when search is available: %s", async (searchAvailable) => {
    await runtime.db.insert(ingredient).values({ id: "global", name: "Chickpeas", normalizedName: "chickpeas", userId: null, costBasisUnit: "G" });
    await runtime.db.insert(ingredientAlias).values({ id: "global-alias", ingredientId: "global", aliasNormalized: "house legumes" });
    const alone = await suggest(["1 cup house legumes"]);
    expect(alone.suggestions[0]?.suggestedIngredient).toMatchObject({ id: "global", matchType: "alias" });
    if (!searchAvailable) search.mockRejectedValue(new TypeError("offline"));
    const mixed = await suggest(["1 cup house legumes", "garbanzo beans"]);
    expect(mixed.suggestions[0]?.suggestedIngredient).toEqual(alone.suggestions[0]?.suggestedIngredient);
    expect(mixed.aiStatus).toBe(searchAvailable ? "succeeded" : "failed");
    if (searchAvailable) {
      expect(mixed.suggestions[1]?.suggestedIngredient).toMatchObject({ id: "owned", matchType: "clef" });
      const payload = run.mock.calls[0]![1] as ClefIngredientRequest;
      expect(Object.keys(payload.questions)).toEqual(["line_1"]);
    } else expect(run).not.toHaveBeenCalled();
  });

  it("keeps deterministic matches during Clef outages without generating new names", async () => {
    run.mockRejectedValue(new TypeError("offline"));
    const result = await suggest(["salt", "garbanzo beans"]);
    expect(result.aiStatus).toBe("failed"); expect(result.suggestions[0]?.suggestedIngredient?.id).toBe("salt");
    expect(result.suggestions[1]?.suggestedCreateName).toBeUndefined(); expect(search).toHaveBeenCalledOnce();
  });

  it("leaves ambiguous identities for review without a creation suggestion", async () => {
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => decisions(payload, () => "uncertain"));
    const result = await suggest(["1 tbsp white powder"]);
    expect(result.aiStatus).toBe("succeeded"); expect(result.suggestions[0]?.suggestedIngredient).toBeUndefined();
    expect(result.suggestions[0]?.suggestedCreateName).toBeUndefined(); expect(search).toHaveBeenCalledOnce();
  });

  it("retries retrieval before using Scout's empty-catalog creation path", async () => {
    search.mockResolvedValue({ search_query: "q", chunks: [] });
    run.mockImplementation(async (model: string, payload: ClefIngredientRequest) => model === CLEF_INGREDIENT_MODEL
      ? decisions(payload, () => "none")
      : { response: JSON.stringify({ mappings: [{ lineIndex: 0, catalogIndex: -1, createName: "Dragon fruit powder" }] }) });
    const stages: string[] = [];
    const result = await suggest(["1 tbsp dragon fruit powder"], async (stage) => { stages.push(stage); });
    expect(result.suggestions[0]?.suggestedCreateName).toBe("Dragon fruit powder");
    expect(stages).toEqual(["search", "clef", "search", "clef", "generation"]);
    const generation = run.mock.calls.find(([model]) => model !== CLEF_INGREDIENT_MODEL)!;
    expect(generation[1].messages[0].content).toContain("Known ingredients:\n(none)");
    expect(JSON.stringify(generation[1])).not.toContain("Chickpeas");
  });

  it("uses a stronger candidate on retry and avoids suggesting a duplicate ingredient", async () => {
    search.mockResolvedValueOnce({ search_query: "q", chunks: [] });
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => decisions(payload, (_index, criteria) => Object.hasOwn(criteria, "candidate_0") ? "candidate_0" : "none"));
    const result = await suggest(["garbanzo beans"]);
    expect(result.suggestions[0]?.suggestedIngredient).toMatchObject({ id: "owned", matchType: "clef" });
    expect(result.suggestions[0]?.suggestedCreateName).toBeUndefined(); expect(search).toHaveBeenCalledTimes(2);
  });

  it("preserves a successful line if another line's retry fails", async () => {
    search.mockImplementation(async (input) => {
      if (input.query === "dragon fruit powder") throw new TypeError("retry offline");
      return { search_query: "q", chunks: input.query?.includes("garbanzo") ? [chunk()] : [] };
    });
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => decisions(payload, (index) => index === 0 ? "candidate_0" : "none"));
    const result = await suggest(["garbanzo beans", "dragon fruit powder"]);
    expect(result.aiStatus).toBe("failed"); expect(result.suggestions[0]?.suggestedIngredient?.id).toBe("owned");
    expect(result.suggestions[1]?.suggestedCreateName).toBeUndefined();
  });

  it("revalidates IDs and removes candidates whose owner changes during Clef inference", async () => {
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => {
      await runtime.db.update(ingredient).set({ userId: "u2" }).where(eq(ingredient.id, "owned"));
      return decisions(payload);
    });
    const result = await suggest(["garbanzo beans"]);
    expect(result.aiStatus).toBe("failed"); expect(result.suggestions[0]?.suggestedIngredient).toBeUndefined();
    expect(result.suggestions[0]?.candidates).toEqual([]);
  });

  it("removes a deterministic alias if its target becomes private during unrelated inference", async () => {
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => {
      await runtime.db.update(ingredient).set({ userId: "u2" }).where(eq(ingredient.id, "salt"));
      return decisions(payload);
    });
    const result = await suggest(["sodium chloride", "garbanzo beans"]);
    expect(result.aiStatus).toBe("failed");
    expect(result.suggestions[0]?.suggestedIngredient).toBeUndefined();
    expect(result.suggestions[1]?.suggestedIngredient).toMatchObject({ id: "owned", matchType: "clef" });
  });

  it("rejects an unknown model option without exposing or accepting its ID", async () => {
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => decisions(payload, () => "foreign"));
    const result = await suggest(["garbanzo beans"]);
    expect(result.aiStatus).toBe("failed"); expect(result.suggestions[0]?.suggestedIngredient).toBeUndefined();
    expect(result.suggestions[0]?.suggestedCreateName).toBeUndefined();
  });

  it("returns all 200 rows while exhausting a finite provider budget safely", async () => {
    search.mockResolvedValue({ search_query: "q", chunks: [] });
    run.mockImplementation(async (_model, payload: ClefIngredientRequest) => decisions(payload, () => "none"));
    const result = await suggest(Array.from({ length: 200 }, (_, index) => `Unknown ingredient ${index}`));
    expect(result.suggestions).toHaveLength(200); expect(result.aiStatus).toBe("failed");
    expect(search).toHaveBeenCalledTimes(MAX_MAPPING_REQUESTS.search);
    expect(result.suggestions.every((row) => !row.suggestedCreateName && !row.suggestedIngredient)).toBe(true);
  });

  it("enforces the shared 200-line limit before deterministic queries or providers", async () => {
    await expect(suggest(Array.from({ length: 201 }, () => "salt"))).rejects.toBeInstanceOf(IngredientMappingInputError);
    expect(search).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it("logs counts and durations without private ingredient lines or names", async () => {
    await suggest(["garbanzo beans"]);
    const logs = vi.mocked(console.info).mock.calls.flat().join(" ");
    expect(logs).toContain("ingredient_mapping_summary");
    expect(logs).not.toContain("garbanzo"); expect(logs).not.toContain("Chickpeas"); expect(logs).not.toContain("Private blend");
  });

  it("does not log private lines echoed by a failed name-generation provider", async () => {
    search.mockResolvedValue({ search_query: "q", chunks: [] });
    run.mockImplementation(async (model, payload: ClefIngredientRequest) => {
      if (model === CLEF_INGREDIENT_MODEL) return decisions(payload, () => "none");
      throw new TypeError("provider echoed private saffron powder");
    });
    const result = await suggest(["private saffron powder"]);
    expect(result.aiStatus).toBe("failed");
    expect(result.suggestions[0]?.suggestedCreateName).toBeUndefined();
    expect(vi.mocked(console.info).mock.calls.flat().join(" ")).not.toContain("private saffron powder");
  });
});
