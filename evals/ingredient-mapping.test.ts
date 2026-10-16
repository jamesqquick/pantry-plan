import { expect, test } from "vitest";
import { createTestHarness } from "wrangler";
import type { EvaluationResult } from "./ingredient-mapping.worker";
import { EVALUATION_OTHER_USER_ID, INGREDIENT_EVALUATION_CASES, INGREDIENT_EVALUATION_CATALOG } from "../src/lib/ingredients/mapping-evaluation.fixtures";

function candidateRecall(result: Pick<EvaluationResult, "mode" | "unresolvedKnownCaseIds" | "cases" | "modelCalls">) {
  if (result.mode === "legacy") return null;
  const first = new Map<string, string[]>();
  const last = new Map<string, string[]>();
  for (const call of result.modelCalls) for (const line of call.lines) {
    if (!first.has(line.caseId)) first.set(line.caseId, line.candidateIds);
    last.set(line.caseId, line.candidateIds);
  }
  const positives = result.cases.filter((entry) => result.unresolvedKnownCaseIds.includes(entry.id));
  const recalled = (shortlists: Map<string, string[]>) => positives.filter((entry) =>
    shortlists.get(entry.id)?.includes(entry.expected!)).length;
  return { denominator: positives.length, initial: recalled(first), final: recalled(last) };
}

function summarize(result: EvaluationResult, round: number) {
  const accepted = result.cases.filter((entry) => entry.actual !== null);
  const clef = accepted.filter((entry) => entry.source === "clef");
  const tokens = result.modelCalls.reduce((sum, call) => ({
    clefInput: sum.clefInput + (call.usage?.input_tokens ?? 0),
    scoutInput: sum.scoutInput + (call.usage?.prompt_tokens ?? 0),
    scoutOutput: sum.scoutOutput + (call.usage?.completion_tokens ?? 0),
  }), { clefInput: 0, scoutInput: 0, scoutOutput: 0 });
  const modelCostUsd = (tokens.clefInput * 0.24 + tokens.scoutInput * 0.27 + tokens.scoutOutput * 0.85) / 1_000_000;
  return {
    round, mode: result.mode, durationMs: result.durationMs, aiStatus: result.aiStatus,
    total: result.cases.length,
    identityCorrect: result.cases.filter((entry) => entry.actual === entry.expected).length,
    workflowCorrect: result.cases.filter((entry) => entry.expected !== null ? entry.actual === entry.expected
      : entry.actual === null && (entry.category === "new" ? !!entry.createName : !entry.createName)).length,
    accepted: accepted.length,
    correctAccepted: accepted.filter((entry) => entry.actual === entry.expected).length,
    wrongMatches: accepted.filter((entry) => entry.actual !== entry.expected).length,
    abstained: result.cases.length - accepted.length,
    unnecessaryCreation: result.cases.filter((entry) => entry.createName && entry.category !== "new").length,
    clefAccepted: clef.length,
    clefCorrect: clef.filter((entry) => entry.actual === entry.expected).length,
    candidateRecall: candidateRecall(result), tokens, modelCostUsd,
    unpricedModelCalls: result.modelCalls.filter((call) => !call.usage).length,
    searchCalls: result.searchCalls.length,
    searchFailures: result.searchCalls.filter((call) => call.outcome !== "succeeded").length,
    futureServingCostUsd: modelCostUsd + result.searchCalls.length * 0.75 / 1_000,
    modelCalls: result.modelCalls.length,
    inputBytes: result.modelCalls.reduce((sum, call) => sum + call.inputBytes, 0),
  };
}

test("counts known ingredients missing from decision inputs as recall misses", () => {
  expect(candidateRecall({
    mode: "retrieval", unresolvedKnownCaseIds: ["found", "search-failed"],
    cases: ["found", "search-failed"].map((id) => ({
      id, category: "synonym", expected: "known", actual: null, createName: null, source: null, candidateIds: [],
    })),
    modelCalls: [{
      model: "@cf/cloudflare/clef", inputBytes: 1, durationMs: 1, outcome: "succeeded",
      lines: [{ caseId: "found", candidateIds: ["known"] }],
    }],
  })).toEqual({ denominator: 2, initial: 1, final: 1 });
});

test("compares legacy and retrieval against the development catalog", async () => {
  const server = createTestHarness({ workers: [{ config: {
    name: "ingredient-evaluation",
    main: "evals/ingredient-mapping.worker.ts",
    account_id: "4426cbeacb457b1ca1b865d6c36ced0d",
    compatibility_date: "2026-04-20",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    tsconfig: "tsconfig.json",
    ai: { binding: "AI", remote: true },
    ai_search_namespaces: [{ binding: "AI_SEARCH", namespace: "default", remote: true }],
    d1_databases: [{
      binding: "DB", database_name: "ingredient-evaluation",
      database_id: "ef264248-c675-4b1a-879d-a15f05996d80", migrations_dir: "src/db/migrations",
    }],
    vars: { INGREDIENT_AI_SEARCH_INSTANCE: "quickpantry-ingredients-dev" },
  } }] });
  async function call<T>(path: string): Promise<T> {
    const response = await server.fetch(`http://localhost${path}`);
    expect(response.ok, `${path} returned ${response.status}`).toBe(true);
    return await response.json() as T;
  }
  try {
    await server.listen();
    await server.getWorker().applyD1Migrations("DB");
    console.log("CATALOG", JSON.stringify(await call("/seed")));
    for (let batch = 0; batch < 20; batch++) {
      const indexed = await call<{ failed: number; remaining: number }>("/index");
      expect(indexed.failed, "Fixture uploads failed").toBe(0);
      if (indexed.remaining === 0) break;
      expect(batch, "Fixture uploads did not finish").toBeLessThan(19);
    }
    let ready = { total: 0, completed: 0, errors: [] as string[] };
    for (let poll = 0; poll < 120; poll++) {
      ready = await call<typeof ready>("/ready");
      expect(ready.errors, "Fixture indexing errors").toEqual([]);
      if (ready.completed === INGREDIENT_EVALUATION_CATALOG.length) break;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    expect(ready).toMatchObject({ total: 24, completed: 24 });
    const isolation = await call<{ chunks: number; foreignChunks: number }>("/isolation");
    console.log("ISOLATION", JSON.stringify(isolation));
    expect(isolation.foreignChunks).toBe(0);
    const visibleIds = new Set<string>(INGREDIENT_EVALUATION_CATALOG.filter((entry) =>
      entry.userId !== EVALUATION_OTHER_USER_ID).map((entry) => entry.id));
    for (let round = 1; round <= 3; round++) {
      for (const mode of round % 2 === 1 ? ["legacy", "retrieval"] : ["retrieval", "legacy"]) {
        const result = await call<EvaluationResult>(`/${mode}`);
        console.log("SUMMARY", JSON.stringify(summarize(result, round)));
        console.log("RESULT", JSON.stringify({ round, ...result }));
        expect(result.cases.map((entry) => entry.id)).toEqual(INGREDIENT_EVALUATION_CASES.map((entry) => entry.id));
        for (const entry of result.cases) {
          if (entry.actual) expect(visibleIds.has(entry.actual)).toBe(true);
          if (mode === "retrieval") expect(entry.candidateIds.length).toBeLessThanOrEqual(12);
        }
        for (const model of result.modelCalls) for (const line of model.lines) {
          expect(line.candidateIds.every((id) => visibleIds.has(id))).toBe(true);
        }
      }
    }
  } finally { await server.close(); }
});
