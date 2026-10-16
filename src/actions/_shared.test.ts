import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { createTestDb } from "@/test/d1";

const mocks = vi.hoisted(() => ({
  env: {
    AI: { run: vi.fn() }, FLAGS: {}, AI_RATE_LIMIT: {}, INGREDIENT_SEARCH_RATE_LIMIT: {},
    INGREDIENT_CLEF_MAPPING_ENABLED: "false",
  },
  flag: vi.fn(), instance: vi.fn(), suggest: vi.fn(), rateLimit: vi.fn(), queue: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("astro:actions", () => ({
  ActionError: class extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  },
}));
vi.mock("@/lib/feature-flags", () => ({ getBooleanFlag: mocks.flag }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/lib/search/ingredient-index", () => ({ getIngredientSearchInstance: mocks.instance, queueIngredientIndexSync: mocks.queue }));
vi.mock("@/lib/ingredients/suggest-ingredient-mappings", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ingredients/suggest-ingredient-mappings")>(),
  suggestIngredientMappings: mocks.suggest,
}));

import { IngredientMappingInputError } from "@/lib/ingredients/suggest-ingredient-mappings";
import { queueIngredientSync, suggestIngredientMappingsForUser, type AuthenticatedUser } from "./_shared";

let runtime: ReturnType<typeof createTestDb>;
const user: AuthenticatedUser = { id: "u1", name: "One", email: "one@example.com", emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0), role: "USER" };
const ctx = { locals: { user, session: null } } as ActionAPIContext;
const instance = { search: vi.fn(), items: {} };
const result = { suggestions: [], aiStatus: "not-needed" };

beforeEach(() => {
  runtime = createTestDb();
  vi.clearAllMocks();
  mocks.env.INGREDIENT_CLEF_MAPPING_ENABLED = "false";
  mocks.flag.mockResolvedValue(false);
  mocks.instance.mockReturnValue(instance);
  mocks.suggest.mockResolvedValue(result);
  mocks.rateLimit.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { runtime.sqlite.close(); vi.restoreAllMocks(); });

describe("ingredient mapping action policy", () => {
  it("targets rollout by authenticated email and ID with a disabled production default", async () => {
    expect(await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user)).toBe(result);
    expect(mocks.flag).toHaveBeenCalledWith(mocks.env.FLAGS, "ingredient-clef-mapping", false, { email: user.email, userId: user.id });
    expect(mocks.instance).not.toHaveBeenCalled();
    expect(mocks.suggest.mock.calls[0]![5]).toMatchObject({ enabled: false, instance: null });
  });

  it("uses the local opt-in as the flag's fallback and resolves the ingredient instance only when enabled", async () => {
    mocks.env.INGREDIENT_CLEF_MAPPING_ENABLED = "true";
    mocks.flag.mockResolvedValue(true);
    await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user);
    expect(mocks.flag.mock.calls[0]![2]).toBe(true);
    expect(mocks.instance).toHaveBeenCalledWith(mocks.env);
    expect(mocks.suggest.mock.calls[0]![5]).toMatchObject({ enabled: true, instance });
  });

  it("charges every search separately and shares Clef/Scout admission with AI imports", async () => {
    mocks.flag.mockResolvedValue(true);
    await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user);
    const options = mocks.suggest.mock.calls[0]![5];
    await options.beforeRequest("search");
    await options.beforeRequest("clef");
    await options.beforeRequest("generation");
    expect(mocks.rateLimit.mock.calls).toEqual([
      [mocks.env.INGREDIENT_SEARCH_RATE_LIMIT, "ai:ingredient-search:u1"],
      [mocks.env.AI_RATE_LIMIT, "ai:u1"],
      [mocks.env.AI_RATE_LIMIT, "ai:u1"],
    ]);
  });

  it("keeps the shared model limit on the legacy rollback path", async () => {
    await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user);
    await mocks.suggest.mock.calls[0]![4]();
    expect(mocks.rateLimit).toHaveBeenCalledWith(mocks.env.AI_RATE_LIMIT, "ai:u1");
  });

  it("keeps rollout evaluation failures on the legacy path", async () => {
    mocks.flag.mockRejectedValueOnce(new TypeError("flag unavailable"));
    await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user);
    expect(mocks.instance).not.toHaveBeenCalled();
    expect(mocks.suggest.mock.calls[0]![5].enabled).toBe(false);
  });

  it("leaves an enabled missing binding unavailable without switching to a broad catalog", async () => {
    mocks.flag.mockResolvedValue(true);
    mocks.instance.mockImplementationOnce(() => { throw new TypeError("binding unavailable"); });
    await suggestIngredientMappingsForUser(ctx, runtime.db, ["garbanzo beans"], user);
    expect(mocks.suggest.mock.calls[0]![5]).toMatchObject({ enabled: true, instance: null });
  });

  it("exposes the line limit as a bad-request action error", async () => {
    mocks.suggest.mockRejectedValueOnce(new IngredientMappingInputError(201));
    await expect(suggestIngredientMappingsForUser(ctx, runtime.db, Array.from({ length: 201 }, () => "salt"), user)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("binds waitUntil to its receiver for preview recovery and post-write synchronization", async () => {
    const pending: Promise<unknown>[] = [];
    const cf = { waitUntil(promise: Promise<unknown>) { expect(this).toBe(cf); pending.push(promise); } };
    const backgroundCtx = { locals: { user, session: null, cfContext: cf } } as ActionAPIContext;
    await suggestIngredientMappingsForUser(backgroundCtx, runtime.db, ["garbanzo beans"], user);
    mocks.suggest.mock.calls[0]![5].waitUntil(Promise.resolve());
    await queueIngredientSync(backgroundCtx, runtime.db, ["one", "two"]);
    expect(mocks.queue).toHaveBeenCalledWith(runtime.db, mocks.env, expect.any(Function), ["one", "two"]);
    mocks.queue.mock.calls[0]![2](Promise.resolve());
    expect(pending).toHaveLength(2);
    await Promise.all(pending);
  });
});
