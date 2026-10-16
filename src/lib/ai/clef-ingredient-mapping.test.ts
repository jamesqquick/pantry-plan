import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngredientMappingRequest } from "@/lib/ingredients/mapping-request";
import { buildClefIngredientRequest, CLEF_INGREDIENT_MODEL, MAX_CLEF_REQUEST_BYTES, parseClefIngredientDecision, selectIngredientsWithClef, type ClefIngredientAi, type ClefIngredientLine } from "./clef-ingredient-mapping";

const request: IngredientMappingRequest = (_stage, call) => call();
const line: ClefIngredientLine = { originalIndex: 9, text: "1 cup garbanzo beans", candidates: [{ id: "chickpeas", name: "Chickpeas", normalizedName: "chickpeas", aliases: ["garbanzo beans"] }] };
function answer(choice = "candidate_0", probabilities = { candidate_0: 0.9, none: 0.07, uncertain: 0.03 }) {
  return { type: "choice", choice, probabilities, confidence: 0.78 };
}
afterEach(() => vi.restoreAllMocks());

describe("Clef typed ingredient decisions", () => {
  it("uses typed choice questions with explicit none and uncertain options", () => {
    const payload = buildClefIngredientRequest([line]);
    expect(payload).toMatchObject({ model: "clef", state: { line_9: line.text }, questions: { line_9: { type: "choice", criteria: {
      candidate_0: "Chickpeas, also known as garbanzo beans", none: expect.any(String), uncertain: expect.any(String),
    } } } });
    expect(parseClefIngredientDecision(answer(), line)).toMatchObject({ kind: "match", ingredientId: "chickpeas", probability: 0.9 });
  });

  it.each([
    [null, "invalid"],
    [{ choice: "candidate_0" }, "invalid"],
    [answer("foreign", { candidate_0: 0.9, none: 0.07, uncertain: 0.03 }), "invalid"],
    [answer("candidate_0", { candidate_0: 1.1, none: -0.1, uncertain: 0 }), "invalid"],
    [answer("candidate_0", { candidate_0: 0.1, none: 0.8, uncertain: 0.1 }), "invalid"],
    [answer("candidate_0", { candidate_0: 0.55, none: 0.35, uncertain: 0.1 }), "low-confidence"],
    [answer("candidate_0", { candidate_0: 0.9, none: 0.9, uncertain: 0.1 }), "invalid"],
    [answer("none", { candidate_0: 0.05, none: 0.9, uncertain: 0.05 }), "none"],
    [answer("uncertain", { candidate_0: 0.05, none: 0.05, uncertain: 0.9 }), "uncertain"],
  ])("handles unusable or abstained answers without guessing an ID", (raw, kind) => {
    expect(parseClefIngredientDecision(raw, line)).toEqual({ kind });
  });

  it("rejects missing probabilities and extra option IDs", () => {
    expect(parseClefIngredientDecision({ ...answer(), probabilities: { candidate_0: 0.9, none: 0.1 } }, line)).toEqual({ kind: "invalid" });
    expect(parseClefIngredientDecision({ ...answer(), probabilities: { candidate_0: 0.8, none: 0.05, uncertain: 0.05, foreign: 0.1 } }, line)).toEqual({ kind: "invalid" });
  });

  it("requires stronger evidence for creation than a match and always respects explicit uncertainty", () => {
    expect(parseClefIngredientDecision(answer("candidate_0", { candidate_0: 0.65, none: 0.2, uncertain: 0.15 }), line)).toMatchObject({ kind: "match", ingredientId: "chickpeas" });
    expect(parseClefIngredientDecision(answer("none", { candidate_0: 0.2, none: 0.65, uncertain: 0.15 }), line)).toEqual({ kind: "low-confidence" });
    expect(parseClefIngredientDecision(answer("uncertain", { candidate_0: 0.39, none: 0.2, uncertain: 0.41 }), line)).toEqual({ kind: "uncertain" });
  });

  it("can abstain between identifiable new and ambiguous lines even without candidates", () => {
    const empty = { ...line, candidates: [] };
    expect(Object.keys(buildClefIngredientRequest([empty]).questions.line_9!.criteria)).toEqual(["none", "uncertain"]);
    expect(parseClefIngredientDecision({ type: "choice", choice: "uncertain", probabilities: { none: 0.1, uncertain: 0.9 }, confidence: 0.8 }, empty)).toEqual({ kind: "uncertain" });
  });

  it("batches at forty and preserves earlier answers if a later batch fails", async () => {
    const run = vi.fn<ClefIngredientAi["run"]>();
    run.mockImplementationOnce(async (_model, payload) => {
      return { answers: Object.fromEntries(Object.keys(payload.questions).map((key) => [key, answer()])), usage: { input_tokens: 300, output_tokens: 10 } };
    }).mockRejectedValueOnce(new TypeError("provider unavailable"));
    const lines = Array.from({ length: 41 }, (_, originalIndex) => ({ ...line, originalIndex }));
    const decisions = await selectIngredientsWithClef({ run }, lines, request);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith(CLEF_INGREDIENT_MODEL, expect.objectContaining({ model: "clef" }), { gateway: { id: "pantry-plan", skipCache: true } });
    expect(decisions.get(0)).toMatchObject({ kind: "match", ingredientId: "chickpeas" });
    expect(decisions.get(39)).toMatchObject({ kind: "match" });
    expect(decisions.get(40)).toEqual({ kind: "failed" });
  });

  it("isolates malformed answers to their line", async () => {
    const run = vi.fn<ClefIngredientAi["run"]>().mockResolvedValue({ answers: { line_9: answer(), line_10: "bad" } });
    const result = await selectIngredientsWithClef({ run }, [line, { ...line, originalIndex: 10 }], request);
    expect(result.get(9)).toMatchObject({ kind: "match" }); expect(result.get(10)).toEqual({ kind: "invalid" });
  });

  it("bounds input size independently of the question-count limit", async () => {
    const run = vi.fn<ClefIngredientAi["run"]>().mockResolvedValue({ answers: {} });
    const candidates = Array.from({ length: 12 }, (_, index) => ({ id: String(index), name: "米".repeat(500), normalizedName: "米".repeat(500), aliases: Array.from({ length: 5 }, () => "a".repeat(200)) }));
    await selectIngredientsWithClef({ run }, Array.from({ length: 5 }, (_, originalIndex) => ({ ...line, originalIndex, candidates })), request);
    expect(run.mock.calls.length).toBeGreaterThan(1);
    for (const [, payload] of run.mock.calls) expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThanOrEqual(MAX_CLEF_REQUEST_BYTES);
  });
});
