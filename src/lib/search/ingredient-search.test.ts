import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ingredient, ingredientAlias, user } from "@/db";
import { createTestDb } from "@/test/d1";
import type { IngredientMappingRequest } from "@/lib/ingredients/mapping-request";
import { loadVerifiedIngredientCandidates, MAX_INGREDIENT_CANDIDATES, retrieveIngredientCandidates, type IngredientRetrievalLine } from "./ingredient-search";

let runtime: ReturnType<typeof createTestDb>;
const request: IngredientMappingRequest = (_stage, call) => call();
const line: IngredientRetrievalLine = { originalIndex: 7, text: "1 cup garbanzo beans, drained", normalizedKey: "garbanzo beans", fuzzyCandidateIds: [] };

function chunk(id: string, scope = "global", score = 0.8): AiSearchSearchResponse["chunks"][number] {
  return { id: `chunk-${id}-${score}`, type: "text", score, text: "Untrusted remote name", item: { key: `ingredients/${id}.md`, metadata: { ingredient_id: id, scope_key: scope } } };
}

beforeEach(async () => {
  runtime = createTestDb();
  await runtime.db.insert(user).values([{ id: "u1", name: "One", email: "one@example.com" }, { id: "u2", name: "Two", email: "two@example.com" }]);
  await runtime.db.insert(ingredient).values([
    { id: "global", name: "Chickpeas", normalizedName: "chickpeas", userId: null, costBasisUnit: "G" },
    { id: "owned", name: "My chickpeas", normalizedName: "chickpeas", userId: "u1", costBasisUnit: "G" },
    { id: "lentils", name: "Lentils", normalizedName: "lentils", userId: null, costBasisUnit: "G" },
    { id: "foreign", name: "Secret blend", normalizedName: "secret blend", userId: "u2", costBasisUnit: "G" },
  ]);
  await runtime.db.insert(ingredientAlias).values({ id: "alias", ingredientId: "owned", aliasNormalized: "garbanzo beans" });
});

afterEach(() => { runtime.sqlite.close(); vi.restoreAllMocks(); });

describe("ingredient candidate retrieval", () => {
  it("filters before retrieval, deduplicates chunks, and loads current D1 names and aliases with owner preference", async () => {
    const search = vi.fn<AiSearchInstance["search"]>(async () => ({ search_query: "q", chunks: [chunk("global"), chunk("global", "global", 0.7), chunk("lentils", "global", 0.5)] }));
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line]);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ ai_search_options: expect.objectContaining({
      retrieval: expect.objectContaining({ filters: { scope_key: { $in: ["global", "user:u1"] } }, metadata_only: true, return_on_failure: false }), cache: { enabled: false },
    }) }));
    expect(result.get(7)).toEqual({ failed: false, candidates: [
      { id: "owned", name: "My chickpeas", normalizedName: "chickpeas", aliases: ["garbanzo beans"] },
      { id: "lentils", name: "Lentils", normalizedName: "lentils", aliases: [] },
    ] });
  });

  it("rejects foreign, forged, deleted and mismatched metadata without trusting remote text", async () => {
    const badKey = chunk("lentils"); badKey.item.key = "ingredients/something-else.md";
    const search: AiSearchInstance["search"] = async () => ({ search_query: "q", chunks: [
      chunk("foreign", "global"), chunk("owned", "user:u2"), chunk("deleted"), badKey,
    ] });
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line]);
    expect(result.get(7)).toEqual({ failed: false, candidates: [] });
  });

  it("rejects an ownership change and reflects a rename made while retrieval was in flight", async () => {
    const search: AiSearchInstance["search"] = async () => {
      await runtime.db.update(ingredient).set({ userId: "u2" }).where(eq(ingredient.id, "owned"));
      await runtime.db.update(ingredient).set({ name: "Red lentils" }).where(eq(ingredient.id, "lentils"));
      return { search_query: "q", chunks: [chunk("owned", "user:u1"), chunk("lentils")] };
    };
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line]);
    expect(result.get(7)?.candidates.map(({ id, name }) => ({ id, name }))).toEqual([{ id: "lentils", name: "Red lentils" }]);
  });

  it("merges verified fuzzy candidates and preserves them on search failure", async () => {
    const search = vi.fn<AiSearchInstance["search"]>().mockRejectedValue(new TypeError("search unavailable"));
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [{ ...line, fuzzyCandidateIds: ["foreign", "lentils", "lentils"] }]);
    expect(result.get(7)).toMatchObject({ failed: true, candidates: [{ id: "lentils", name: "Lentils" }] });
  });

  it.each([false, true])("caps candidates after verification and widens only on retry: %s", async (retry) => {
    for (let index = 0; index < 15; index++) await runtime.db.insert(ingredient).values({ id: `live-${index}`, name: `Live ${index}`, normalizedName: `live ${index}`, costBasisUnit: "G" });
    const search: AiSearchInstance["search"] = async () => ({ search_query: "q", chunks: [chunk("deleted"), ...Array.from({ length: 15 }, (_, index) => chunk(`live-${index}`))] });
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line], retry);
    expect(result.get(7)?.candidates).toHaveLength(retry ? MAX_INGREDIENT_CANDIDATES : 6);
    expect(result.get(7)?.candidates[0]?.id).toBe("live-0");
  });

  it("uses a bounded broader retry rather than loading a fallback catalog", async () => {
    const search = vi.fn<AiSearchInstance["search"]>(async () => ({ search_query: "q", chunks: [] }));
    await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line], true);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: "garbanzo beans", ai_search_options: expect.objectContaining({ retrieval: expect.objectContaining({ max_num_results: 30, match_threshold: 0.05 }) }) }));
  });

  it("bounds concurrent searches at four", async () => {
    let active = 0; let maximum = 0;
    const search: AiSearchInstance["search"] = async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
      active--;
      return { search_query: "q", chunks: [] };
    };
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", Array.from({ length: 11 }, (_, originalIndex) => ({ ...line, originalIndex, text: `${line.text} ${originalIndex}` })));
    expect(maximum).toBe(4); expect(result.size).toBe(11);
  });

  it("shares identical lookups only within this scoped request", async () => {
    const search = vi.fn<AiSearchInstance["search"]>(async () => ({ search_query: "q", chunks: [chunk("lentils")] }));
    const result = await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u1", [line, { ...line, originalIndex: 8 }]);
    expect(search).toHaveBeenCalledOnce(); expect(result.get(7)).toEqual(result.get(8));
    await retrieveIngredientCandidates({ db: runtime.db, instance: { search }, request }, "u2", [line]);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("does not expose oversized canonical names from raw database writes", async () => {
    await runtime.db.update(ingredient).set({ name: "a".repeat(100_000) }).where(eq(ingredient.id, "lentils"));
    expect(await loadVerifiedIngredientCandidates(runtime.db, "u1", ["lentils", "foreign"])).toEqual(new Map());
  });
});
