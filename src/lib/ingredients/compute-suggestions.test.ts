import { describe, expect, it } from "vitest";
import { chunkInValues } from "@/db/chunked-read";
import {
  collectFuzzySearchTokens,
  FUZZY_SEARCH_TOKENS_PER_QUERY,
  MAX_FUZZY_SEARCH_QUERIES,
  MAX_FUZZY_SEARCH_TOKEN_LENGTH,
  MAX_FUZZY_SEARCH_TOKENS,
  rankIngredientCatalogCandidates,
} from "./compute-suggestions";

const catalog = [
  {
    id: "global-flour",
    name: "All-Purpose Flour",
    normalizedName: "all purpose flour",
    userId: null,
  },
  {
    id: "user-flour",
    name: "My Flour",
    normalizedName: "all purpose flour",
    userId: "user-1",
  },
  {
    id: "bread-flour",
    name: "Bread Flour",
    normalizedName: "bread flour",
    userId: null,
  },
  {
    id: "salt",
    name: "Salt",
    normalizedName: "salt",
    userId: null,
  },
];

describe("rankIngredientCatalogCandidates", () => {
  it("ranks the complete accessible catalog by token similarity", () => {
    const results = rankIngredientCatalogCandidates(
      "organic bread flour",
      catalog,
      "user-1",
    );

    expect(results.map((result) => result.id)).toEqual([
      "bread-flour",
      "user-flour",
      "global-flour",
    ]);
    expect(results[0]?.score).toBeCloseTo(2 / 3);
  });

  it("prefers the user-owned row when scores tie", () => {
    const results = rankIngredientCatalogCandidates(
      "all purpose flour",
      catalog,
      "user-1",
    );

    expect(results.slice(0, 2).map((result) => result.id)).toEqual([
      "user-flour",
      "global-flour",
    ]);
  });

  it("drops entries below the candidate threshold", () => {
    const results = rankIngredientCatalogCandidates(
      "cinnamon",
      catalog,
      "user-1",
    );

    expect(results).toEqual([]);
  });
});

describe("collectFuzzySearchTokens", () => {
  it("collects tokens fairly by position across ingredient lines", () => {
    expect(
      collectFuzzySearchTokens([
        "alpha beta gamma",
        "delta epsilon zeta",
      ]),
    ).toEqual(["alpha", "delta", "beta", "epsilon", "gamma", "zeta"]);
  });

  it("caps the aggregate token count", () => {
    const keys = Array.from(
      { length: MAX_FUZZY_SEARCH_TOKENS + 20 },
      (_, index) => `token_${index}`,
    );

    const tokens = collectFuzzySearchTokens(keys);
    const chunks = chunkInValues(tokens, 1);

    expect(tokens).toHaveLength(MAX_FUZZY_SEARCH_TOKENS);
    expect(chunks).toHaveLength(MAX_FUZZY_SEARCH_QUERIES);
    expect(
      chunks.every(
        (chunk) => chunk.length <= FUZZY_SEARCH_TOKENS_PER_QUERY,
      ),
    ).toBe(true);
  });

  it("filters noise, numeric, and short tokens and truncates ASCII tokens", () => {
    const longToken = "x".repeat(MAX_FUZZY_SEARCH_TOKEN_LENGTH + 20);

    expect(
      collectFuzzySearchTokens([`a 123 and box salt ${longToken}`]),
    ).toEqual(["salt", "x".repeat(MAX_FUZZY_SEARCH_TOKEN_LENGTH)]);
  });
});
