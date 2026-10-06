import { describe, expect, it } from "vitest";
import { user } from "@/db";
import { createTestDb } from "@/test/d1";
import { createServer, isRecipeAiSearchEnabled, RECIPE_AI_SEARCH_FLAG } from "./server";

describe("isRecipeAiSearchEnabled", () => {
  it("evaluates the flag with the key owner's email and user id", async () => {
    const { db } = createTestDb();
    await db.insert(user).values({ id: "u1", name: "u1", email: "u1@example.com" });
    const calls: unknown[][] = [];
    const flags = {
      getBooleanValue: async (...args: unknown[]) => {
        calls.push(args);
        return true;
      },
    } as unknown as Flagship;

    await expect(isRecipeAiSearchEnabled(db, flags, "u1")).resolves.toBe(true);
    expect(calls).toEqual([
      [RECIPE_AI_SEARCH_FLAG, false, { email: "u1@example.com", userId: "u1" }],
    ]);
  });

  it("returns the default when no Flagship binding is configured", async () => {
    const { db } = createTestDb();
    await expect(isRecipeAiSearchEnabled(db, undefined, "u1")).resolves.toBe(false);
  });
});

describe("MCP tool registration", () => {
  it("registers complete Zod schemas so strict object rules reach MCP", () => {
    const server = createServer(
      undefined as never,
      "user-1",
      "https://quickpantry.test",
      "key-1",
      undefined,
    );
    const schema = server.toolInputSchemaJson("edit_recipe");

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(schema?.required).toContain("recipeId");
  });
});
