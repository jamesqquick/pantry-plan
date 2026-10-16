import { z } from "zod";
import { createDb, ingredient, ingredientAlias, user } from "../src/db";
import { CLEF_INGREDIENT_MODEL } from "../src/lib/ai/clef-ingredient-mapping";
import { computeIngredientSuggestions } from "../src/lib/ingredients/compute-suggestions";
import {
  EVALUATION_OTHER_USER_ID,
  EVALUATION_USER_ID,
  INGREDIENT_EVALUATION_CASES,
  INGREDIENT_EVALUATION_CATALOG,
} from "../src/lib/ingredients/mapping-evaluation.fixtures";
import { normalizeIngredientName } from "../src/lib/ingredients/normalize";
import { suggestIngredientMappings } from "../src/lib/ingredients/suggest-ingredient-mappings";
import { buildIngredientDocument, ingredientDocumentKey } from "../src/lib/search/ingredient-document";
import { syncNextIngredientBatch } from "../src/lib/search/ingredient-index";

type EvaluationEnv = Pick<Cloudflare.Env, "DB" | "AI" | "AI_SEARCH" | "INGREDIENT_AI_SEARCH_INSTANCE">;

export type EvaluationModelCall = {
  model: string;
  inputBytes: number;
  durationMs: number;
  outcome: "pending" | "succeeded" | "failed";
  usage?: { input_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  lines: { caseId: string; candidateIds: string[] }[];
};

export type EvaluationResult = {
  mode: "legacy" | "retrieval";
  durationMs: number;
  aiStatus: string;
  unresolvedKnownCaseIds: string[];
  searchCalls: { durationMs: number; outcome: "pending" | "succeeded" | "failed" }[];
  modelCalls: EvaluationModelCall[];
  cases: {
    id: string;
    category: string;
    expected: string | null;
    actual: string | null;
    createName: string | null;
    source: string | null;
    candidateIds: string[];
    quantity?: number | null;
    unit?: string | null;
  }[];
};

const questionsSchema = z.object({
  questions: z.record(z.string(), z.object({ criteria: z.record(z.string(), z.string()) })),
});
const usageSchema = z.object({
  usage: z.object({
    input_tokens: z.number().optional(),
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
  }),
});

function decisionLines(input: unknown): EvaluationModelCall["lines"] {
  const parsed = questionsSchema.parse(input);
  return Object.entries(parsed.questions).map(([key, question]) => ({
    caseId: INGREDIENT_EVALUATION_CASES[Number(key.slice(5))]!.id,
    candidateIds: Object.entries(question.criteria).flatMap(([option, text]) => {
      if (!option.startsWith("candidate_")) return [];
      const entries = INGREDIENT_EVALUATION_CATALOG.filter((entry) =>
        text === entry.name || text.startsWith(`${entry.name}, also known as `));
      const entry = entries.find((entry) => entry.userId === EVALUATION_USER_ID) ?? entries[0];
      return entry ? [entry.id] : [];
    }),
  }));
}

async function fixtureItems(instance: AiSearchInstance): Promise<AiSearchItemInfo[]> {
  const keys = new Set(INGREDIENT_EVALUATION_CATALOG.map((entry) => ingredientDocumentKey(entry.id)));
  const items: AiSearchItemInfo[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await instance.items.list({ source: "builtin", per_page: 50, page });
    items.push(...response.result.filter((item) => keys.has(item.key)));
    if (response.result.length < 50 || page * 50 >= (response.result_info?.total_count ?? Infinity)) break;
  }
  return items;
}

export default {
  async fetch(request: Request, env: EvaluationEnv): Promise<Response> {
    if (env.INGREDIENT_AI_SEARCH_INSTANCE !== "quickpantry-ingredients-dev") {
      return Response.json({ error: "The evaluation requires quickpantry-ingredients-dev." }, { status: 400 });
    }
    const db = createDb(env.DB);
    const instance = env.AI_SEARCH.get("quickpantry-ingredients-dev");
    const path = new URL(request.url).pathname;
    if (path === "/seed") {
      await db.insert(user).values([
        { id: EVALUATION_USER_ID, name: "Evaluation user", email: "ingredient-evaluation@example.com" },
        { id: EVALUATION_OTHER_USER_ID, name: "Evaluation other", email: "ingredient-evaluation-other@example.com" },
      ]).onConflictDoNothing();
      const documents = [];
      for (const entry of INGREDIENT_EVALUATION_CATALOG) {
        const normalizedName = normalizeIngredientName(entry.name);
        await db.insert(ingredient).values({
          id: entry.id, name: entry.name, normalizedName, userId: entry.userId, costBasisUnit: "G",
        }).onConflictDoNothing();
        for (const [index, alias] of entry.aliases.entries()) {
          await db.insert(ingredientAlias).values({
            id: `${entry.id}-alias-${index}`, ingredientId: entry.id, aliasNormalized: normalizeIngredientName(alias),
          }).onConflictDoNothing();
        }
        documents.push(buildIngredientDocument({ ...entry, normalizedName }));
      }
      return Response.json({
        catalog: documents.length,
        visibleCatalog: INGREDIENT_EVALUATION_CATALOG.filter((entry) => entry.userId !== EVALUATION_OTHER_USER_ID).length,
        documentBytes: documents.reduce((sum, document) => sum + new TextEncoder().encode(document.content).byteLength, 0),
        documents,
      });
    }
    if (path === "/index") return Response.json(await syncNextIngredientBatch({ db, instance }));
    if (path === "/ready") {
      const items = await fixtureItems(instance);
      return Response.json({
        total: items.length,
        completed: items.filter((item) => item.status === "completed").length,
        errors: items.filter((item) => item.status === "error").map((item) => item.key),
      });
    }
    if (path === "/isolation") {
      const result = await instance.search({
        query: "Private saffron blend",
        ai_search_options: {
          retrieval: {
            retrieval_type: "hybrid", max_num_results: 30, metadata_only: true,
            filters: { scope_key: { $in: ["global", `user:${EVALUATION_USER_ID}`] } },
          },
          cache: { enabled: false },
        },
      });
      return Response.json({
        chunks: result.chunks.length,
        foreignChunks: result.chunks.filter((chunk) => chunk.item.metadata?.scope_key === `user:${EVALUATION_OTHER_USER_ID}`).length,
      });
    }
    if (path !== "/legacy" && path !== "/retrieval") return new Response(null, { status: 404 });

    const mode = path === "/legacy" ? "legacy" : "retrieval";
    const lines = INGREDIENT_EVALUATION_CASES.map((entry) => entry.line);
    const deterministic = await computeIngredientSuggestions(db, lines, EVALUATION_USER_ID);
    const modelCalls: EvaluationResult["modelCalls"] = [];
    const searchCalls: EvaluationResult["searchCalls"] = [];
    const measuredInstance = {
      items: instance.items,
      search: async (input: AiSearchSearchRequest) => {
        const call: EvaluationResult["searchCalls"][number] = { durationMs: 0, outcome: "pending" };
        searchCalls.push(call);
        const startedAt = Date.now();
        try {
          const result = await instance.search(input);
          call.outcome = "succeeded";
          return result;
        } catch (error) {
          call.outcome = "failed";
          throw error;
        } finally { call.durationMs = Date.now() - startedAt; }
      },
    };
    const measuredAi = new Proxy(env.AI, {
      get(target, key, receiver) {
        if (key !== "run") return Reflect.get(target, key, receiver);
        return async (model: string, input: unknown, options?: AiOptions) => {
          const call: EvaluationModelCall = {
            model, inputBytes: new TextEncoder().encode(JSON.stringify(input)).byteLength,
            lines: model === CLEF_INGREDIENT_MODEL ? decisionLines(input) : [],
            durationMs: 0, outcome: "pending",
          };
          modelCalls.push(call);
          const startedAt = Date.now();
          try {
            const result: unknown = await Reflect.apply(target.run, target, [
              model, input, { ...options, gateway: { ...options?.gateway, skipCache: true } },
            ]);
            const usage = usageSchema.safeParse(result);
            if (usage.success) call.usage = usage.data.usage;
            call.outcome = "succeeded";
            return result;
          } catch (error) {
            call.outcome = "failed";
            throw error;
          } finally { call.durationMs = Date.now() - startedAt; }
        };
      },
    });
    const startedAt = Date.now();
    const result = await suggestIngredientMappings(
      db, lines, EVALUATION_USER_ID, measuredAi, async () => {},
      mode === "retrieval" ? { enabled: true, instance: measuredInstance, beforeRequest: async () => {} } : undefined,
    );
    return Response.json({
      mode, durationMs: Date.now() - startedAt, aiStatus: result.aiStatus, searchCalls, modelCalls,
      unresolvedKnownCaseIds: INGREDIENT_EVALUATION_CASES.filter((entry, index) =>
        entry.expectedIngredientId !== null && !deterministic[index]!.suggestedIngredient).map((entry) => entry.id),
      cases: result.suggestions.map((suggestion, index) => ({
        id: INGREDIENT_EVALUATION_CASES[index]!.id,
        category: INGREDIENT_EVALUATION_CASES[index]!.category,
        expected: INGREDIENT_EVALUATION_CASES[index]!.expectedIngredientId,
        actual: suggestion.suggestedIngredient?.id ?? null,
        createName: suggestion.suggestedCreateName ?? null,
        source: suggestion.suggestedIngredient?.matchType ?? null,
        candidateIds: suggestion.candidates?.map((candidate) => candidate.id) ?? [],
        quantity: suggestion.parsed?.quantity, unit: suggestion.parsed?.unit,
      })),
    } satisfies EvaluationResult);
  },
} satisfies ExportedHandler<EvaluationEnv>;
