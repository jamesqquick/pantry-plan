import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import { MAX_LINES_PER_RECIPE } from "@/features/import/import.schemas";
import {
  MAX_FUZZY_SEARCH_QUERIES,
  MAX_SUGGESTION_CANDIDATES,
  type SuggestionItem,
} from "./compute-suggestions";

const mocks = vi.hoisted(() => ({
  canUseWorkersAi: vi.fn(),
  computeIngredientSuggestions: vi.fn(),
  suggestMappingsWithLLM: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  canUseWorkersAi: mocks.canUseWorkersAi,
}));
vi.mock("@/lib/ai/llm-ingredient-mapping", () => ({
  suggestMappingsWithLLM: mocks.suggestMappingsWithLLM,
}));
vi.mock("./compute-suggestions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./compute-suggestions")>()),
  computeIngredientSuggestions: mocks.computeIngredientSuggestions,
}));

import {
  collectRoundRobinCandidateIds,
  mergeCandidateFirstCatalog,
  suggestIngredientMappings,
} from "./suggest-ingredient-mappings";

function createCatalogDb(
  fallbackEntries = [
    { id: "salt", name: "Salt", normalizedName: "salt" },
  ],
) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => fallbackEntries,
        }),
      }),
    }),
  } as unknown as Db;
}

const unmappedSuggestion: SuggestionItem = {
  originalLine: "mystery spice",
  normalizedKey: "mystery spice",
};

describe("suggestIngredientMappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canUseWorkersAi.mockReturnValue(true);
    mocks.computeIngredientSuggestions.mockResolvedValue([
      { ...unmappedSuggestion },
    ]);
    mocks.suggestMappingsWithLLM.mockResolvedValue(new Map());
  });

  it("runs the callback immediately before an actual LLM pass", async () => {
    const calls: string[] = [];
    mocks.suggestMappingsWithLLM.mockImplementation(async (...args) => {
      await args[3]?.();
      calls.push("llm");
      return new Map();
    });

    const result = await suggestIngredientMappings(
      createCatalogDb(),
      ["mystery spice"],
      "user-1",
      {} as Ai,
      async () => {
        calls.push("before");
      },
    );

    expect(calls).toEqual(["before", "llm"]);
    expect(result.aiStatus).toBe("succeeded");
  });

  it("does not run the callback when deterministic matching resolves every line", async () => {
    mocks.computeIngredientSuggestions.mockResolvedValue([
      {
        ...unmappedSuggestion,
        suggestedIngredient: {
          id: "salt",
          name: "Salt",
          normalizedName: "salt",
          matchType: "exact",
        },
      },
    ]);
    const beforeLlm = vi.fn();

    const result = await suggestIngredientMappings(
      createCatalogDb(),
      ["salt"],
      "user-1",
      {} as Ai,
      beforeLlm,
    );

    expect(beforeLlm).not.toHaveBeenCalled();
    expect(mocks.suggestMappingsWithLLM).not.toHaveBeenCalled();
    expect(result.aiStatus).toBe("not-needed");
  });

  it("does not run the callback when Workers AI is unavailable", async () => {
    mocks.canUseWorkersAi.mockReturnValue(false);
    const beforeLlm = vi.fn();

    const result = await suggestIngredientMappings(
      createCatalogDb(),
      ["mystery spice"],
      "user-1",
      undefined,
      beforeLlm,
    );

    expect(beforeLlm).not.toHaveBeenCalled();
    expect(mocks.suggestMappingsWithLLM).not.toHaveBeenCalled();
    expect(result.aiStatus).toBe("unavailable");
  });

  it("calls AI for creation suggestions when the merged catalog is empty", async () => {
    const beforeLlm = vi.fn();
    mocks.suggestMappingsWithLLM.mockImplementation(
      async (_ai, _lines, _catalog, beforeRequest) => {
        await beforeRequest?.();
        return new Map([[0, { createName: "Mystery Spice" }]]);
      },
    );

    const result = await suggestIngredientMappings(
      createCatalogDb([]),
      ["mystery spice"],
      "user-1",
      {} as Ai,
      beforeLlm,
    );

    expect(beforeLlm).toHaveBeenCalledOnce();
    expect(mocks.suggestMappingsWithLLM).toHaveBeenCalledWith(
      {},
      [{ originalIndex: 0, text: "mystery spice" }],
      [],
      beforeLlm,
    );
    expect(result).toEqual({
      suggestions: [
        { ...unmappedSuggestion, suggestedCreateName: "Mystery Spice" },
      ],
      aiStatus: "succeeded",
    });
  });

  it("merges LLM matches into deterministic suggestions", async () => {
    mocks.suggestMappingsWithLLM.mockResolvedValue(
      new Map([[0, { ingredientId: "salt" }]]),
    );

    const result = await suggestIngredientMappings(
      createCatalogDb(),
      ["mystery spice"],
      "user-1",
      {} as Ai,
    );

    expect(result).toEqual({
      suggestions: [
        {
          ...unmappedSuggestion,
          suggestedIngredient: {
            id: "salt",
            name: "Salt",
            normalizedName: "salt",
            matchType: "llm",
          },
        },
      ],
      aiStatus: "succeeded",
    });
  });

  it("preserves deterministic suggestions and reports an LLM failure", async () => {
    mocks.suggestMappingsWithLLM.mockRejectedValue(new Error("model unavailable"));

    const result = await suggestIngredientMappings(
      createCatalogDb(),
      ["mystery spice"],
      "user-1",
      {} as Ai,
    );

    expect(result).toEqual({
      suggestions: [{ ...unmappedSuggestion }],
      aiStatus: "failed",
    });
  });
});

describe("mergeCandidateFirstCatalog", () => {
  it("orders accessible candidates first and dedupes fallback entries", () => {
    const candidate = {
      id: "candidate",
      name: "Candidate",
      normalizedName: "candidate",
    };
    const fallback = {
      id: "fallback",
      name: "Fallback",
      normalizedName: "fallback",
    };

    expect(
      mergeCandidateFirstCatalog(
        ["missing", "candidate", "candidate"],
        [candidate],
        [fallback, candidate],
      ),
    ).toEqual([candidate, fallback]);
  });

  it("caps the merged catalog at 500 candidate-first entries", () => {
    const candidateEntries = Array.from({ length: 501 }, (_, index) => ({
      id: `candidate-${index}`,
      name: `Candidate ${index}`,
      normalizedName: `candidate ${index}`,
    }));

    const catalog = mergeCandidateFirstCatalog(
      candidateEntries.map((entry) => entry.id),
      candidateEntries,
      [{ id: "fallback", name: "Fallback", normalizedName: "fallback" }],
    );

    expect(catalog).toHaveLength(500);
    expect(catalog[0]?.id).toBe("candidate-0");
    expect(catalog.at(-1)?.id).toBe("candidate-499");
  });

  it("keeps the worst-case preview read budget at 25 queries", () => {
    const lineIndexes = Array.from(
      { length: MAX_LINES_PER_RECIPE },
      (_, index) => index,
    );
    const candidateIds = Array.from(
      { length: 500 },
      (_, index) => index,
    );
    const ownerAndRows = 2;
    const exactReads = chunkInValues(lineIndexes, 1).length;
    const aliasReads = chunkInValues(lineIndexes, 1).length;
    const candidateReads = chunkInValues(candidateIds, 1).length;
    const fallbackReads = 1;

    expect(
      ownerAndRows +
        exactReads +
        aliasReads +
        MAX_FUZZY_SEARCH_QUERIES +
        candidateReads +
        fallbackReads,
    ).toBe(25);
  });
});

describe("collectRoundRobinCandidateIds", () => {
  it("dedupes candidates while preserving rank-major order", () => {
    expect(
      collectRoundRobinCandidateIds([
        [{ id: "shared" }, { id: "row-1-second" }],
        [{ id: "shared" }, { id: "row-2-second" }],
      ]),
    ).toEqual(["shared", "row-1-second", "row-2-second"]);
  });

  it("fairly includes the last row's strongest candidates within the 500 cap", () => {
    const candidateLists = Array.from(
      { length: MAX_LINES_PER_RECIPE },
      (_, rowIndex) =>
        Array.from({ length: MAX_SUGGESTION_CANDIDATES }, (_, rank) => ({
          id: `row-${rowIndex}-rank-${rank}`,
        })),
    );

    const candidateIds = collectRoundRobinCandidateIds(candidateLists);

    expect(candidateIds).toHaveLength(500);
    expect(candidateIds[0]).toBe("row-0-rank-0");
    expect(candidateIds[199]).toBe("row-199-rank-0");
    expect(candidateIds[200]).toBe("row-0-rank-1");
    expect(candidateIds[399]).toBe("row-199-rank-1");
    expect(candidateIds[400]).toBe("row-0-rank-2");
    expect(candidateIds).toContain("row-199-rank-0");
    expect(candidateIds).toContain("row-199-rank-1");
  });
});
