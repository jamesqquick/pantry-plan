export type IngredientMappingStage = "search" | "clef" | "generation";
export type IngredientMappingRequest = <T>(stage: IngredientMappingStage, call: () => Promise<T>) => Promise<T>;

export const INGREDIENT_MAPPING_BUDGET_MS = 30_000;
export const MAX_MAPPING_REQUESTS = { search: 80, clef: 12, generation: 5 } as const;

export class IngredientMappingLimitError extends Error {
  constructor(public readonly stage: IngredientMappingStage) {
    super(`Ingredient mapping ${stage} request budget exhausted.`);
    this.name = "IngredientMappingLimitError";
  }
}

export class IngredientMappingTimeoutError extends Error {
  constructor(public readonly stage: IngredientMappingStage) {
    super(`Ingredient mapping ${stage} timed out.`);
    this.name = "IngredientMappingTimeoutError";
  }
}

export function createIngredientMappingRequest(beforeRequest?: (stage: IngredientMappingStage) => Promise<void>) {
  const deadline = Date.now() + INGREDIENT_MAPPING_BUDGET_MS;
  const reserved = { search: 0, clef: 0, generation: 0 };
  const counts = { search: 0, clef: 0, generation: 0 };

  const run: IngredientMappingRequest = async (stage, call) => {
    if (reserved[stage] >= MAX_MAPPING_REQUESTS[stage]) throw new IngredientMappingLimitError(stage);
    if (Date.now() >= deadline) throw new IngredientMappingTimeoutError(stage);
    reserved[stage]++;
    const startedAt = Date.now();
    const timeoutMs = Math.min(stage === "generation" ? 15_000 : 8_000, deadline - startedAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    let succeeded = false;
    try {
      return await Promise.race([
        Promise.resolve().then(async () => {
          await beforeRequest?.(stage);
          if (expired || Date.now() >= deadline) throw new IngredientMappingTimeoutError(stage);
          counts[stage]++;
          return call();
        }).then((result) => { succeeded = true; return result; }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new IngredientMappingTimeoutError(stage));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      console.info(JSON.stringify({ event: "ingredient_mapping_request", stage, success: succeeded && !expired, durationMs: Date.now() - startedAt }));
    }
  };
  return { run, counts, deadline };
}
