import { afterEach, describe, expect, it, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport, type CallToolResult } from "@modelcontextprotocol/server";
import type { DatabaseSync } from "node:sqlite";
import { recipe, recipeIngredient, recipeInstruction, user, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { createServer, isRecipeAiSearchEnabled, RECIPE_AI_SEARCH_FLAG } from "./server";
import { createMcpRecipe } from "./create-recipe";

vi.mock("@/lib/parse/parse-recipe", () => ({ parseRecipeFromUrl: vi.fn() }));

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const sqlite of databases.splice(0)) sqlite.close();
});

async function callTool(db: Db, name: string, input: Record<string, unknown>) {
  const server = createServer(db, "cook", "https://quickpantry.test", undefined);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("https://quickpantry.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }),
    }));
    expect(response.status).toBe(200);
    const message = await response.json() as { result: CallToolResult; error?: unknown };
    expect(message.error).toBeUndefined();
    return message.result;
  } finally {
    await server.close();
  }
}

async function listTools() {
  const server = createServer(
    undefined as never,
    "user-1",
    "https://quickpantry.test",
    undefined,
  );
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("https://quickpantry.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
    expect(response.status).toBe(200);
    const message = await response.json() as {
      result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
      error?: unknown;
    };
    expect(message.error).toBeUndefined();
    return message.result.tools;
  } finally {
    await server.close();
  }
}

async function setupDb() {
  const test = createTestDb();
  databases.push(test.sqlite);
  await test.db.insert(user).values({ id: "cook", name: "Cook", email: "cook@example.test" });
  return test;
}

describe("isRecipeAiSearchEnabled", () => {
  it("evaluates the flag with the key owner's email and user id", async () => {
    const { db, sqlite } = createTestDb();
    databases.push(sqlite);
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
    const { db, sqlite } = createTestDb();
    databases.push(sqlite);
    await expect(isRecipeAiSearchEnabled(db, undefined, "u1")).resolves.toBe(false);
  });
});

describe("MCP tool registration", () => {
  it("registers complete Zod schemas so strict object rules reach MCP", async () => {
    const server = createServer(
      undefined as never,
      "user-1",
      "https://quickpantry.test",
      undefined,
    );
    const schema = server.toolInputSchemaJson("edit_recipe");

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(schema?.required).toContain("recipeId");
    for (const name of ["create_recipe", "edit_recipe"]) {
      expect(server.toolInputSchemaJson(name)).toMatchObject({
        properties: {
          ingredients: { items: { required: expect.arrayContaining(["quantity", "unit"]) } },
        },
      });
    }

    const tools = await listTools();
    for (const name of ["create_recipe", "edit_recipe"]) {
      const tool = tools.find((listedTool) => listedTool.name === name);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        properties: {
          ingredients: {
            items: {
              additionalProperties: false,
              required: expect.arrayContaining(["quantity", "unit", "displayText"]),
              properties: {
                quantity: { description: expect.stringMatching(/separately from displayText/i) },
                unit: { description: expect.stringMatching(/separately from displayText/i) },
                displayText: { description: expect.stringMatching(/quantity and unit/i) },
              },
            },
          },
        },
      });
    }

    const createTool = tools.find((tool) => tool.name === "create_recipe");
    expect(createTool).toBeDefined();
    expect(createTool?.description).toMatch(/separate fields/i);
    expect(createTool?.description).toMatch(/does not parse/i);
  });
});

describe("MCP measurement errors", () => {
  it("returns an actionable tool error for unresolved URL import ingredients", async () => {
    const { db } = await setupDb();
    vi.mocked(parseRecipeFromUrl).mockResolvedValue({
      ok: true,
      data: {
        title: "Soup",
        sourceUrl: "https://example.test/soup",
        ingredients: ["Salt to taste"],
        instructions: ["Season."],
      },
    });

    const result = await callTool(db, "import_recipe_from_url", { url: "https://example.test/soup" });

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringMatching(/Ingredient 1 "Salt to taste".*Quantity.*Unit/) }],
    });
    expect(await db.select().from(recipe)).toEqual([]);
    expect(await db.select().from(recipeIngredient)).toEqual([]);
  });

  it.each([
    {},
    { quantity: 1 },
    { unit: "TSP" },
    { quantity: null, unit: "TSP" },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
    { quantity: "1", unit: "TSP" },
    { quantity: -1, unit: "TSP" },
    { quantity: 1, unit: "ML" },
  ])("returns normal create/edit tool errors for invalid measurements: %o", async (amount) => {
    const { db } = await setupDb();
    const saved = await createMcpRecipe(db, "cook", {
      title: "Keep this soup",
      ingredients: [{ quantity: 1, unit: "TSP", displayText: "salt to taste" }],
      instructions: ["Season."],
    });
    const before = {
      recipes: await db.select().from(recipe),
      ingredients: await db.select().from(recipeIngredient),
      instructions: await db.select().from(recipeInstruction),
    };
    const ingredients = [{ displayText: "salt to taste", ...amount }];
    const created = await callTool(db, "create_recipe", { title: "Rejected soup", ingredients, instructions: ["Changed instruction"] });
    const edited = await callTool(db, "edit_recipe", { recipeId: saved.recipeId, title: "Rejected soup", ingredients, instructions: ["Changed instruction"] });

    for (const result of [created, edited]) {
      expect(result.isError).toBe(true);
      expect(result.content).toMatchObject([{ type: "text", text: expect.stringMatching(/quantity|unit/i) }]);
      expect(JSON.stringify(result.content)).toContain("ingredients");
    }
    expect(await db.select().from(recipe)).toEqual(before.recipes);
    expect(await db.select().from(recipeIngredient)).toEqual(before.ingredients);
    expect(await db.select().from(recipeInstruction)).toEqual(before.instructions);
  });

  it.each([
    { quantity: null, unit: "TSP" as const },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
  ])("keeps incomplete legacy recipes readable and requires repair before partial edits: %o", async (amount) => {
    const { db } = await setupDb();
    await db.insert(recipe).values({ id: "legacy", userId: "cook", title: "Legacy soup" });
    await db.insert(recipeIngredient).values({ recipeId: "legacy", ...amount, displayText: "salt to taste", rawText: "  Salt to taste  ", sortOrder: 0 });
    await db.insert(recipeInstruction).values({ recipeId: "legacy", text: "Season.", sortOrder: 0 });
    const before = await db.select().from(recipe);

    const read = await callTool(db, "get_recipe", { recipeId: "legacy" });
    expect(read.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({ ingredients: [{ ...amount, displayText: "salt to taste" }] });

    const edited = await callTool(db, "edit_recipe", { recipeId: "legacy", title: "Changed", instructions: ["Changed instruction"] });
    expect(edited).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringMatching(/Ingredient 1 "salt to taste"/) }],
    });
    if (amount.quantity === null) expect(JSON.stringify(edited.content)).toContain("Quantity");
    if (amount.unit === null) expect(JSON.stringify(edited.content)).toContain("Unit");
    expect(await db.select().from(recipe)).toEqual(before);
    expect(await db.select().from(recipeInstruction)).toMatchObject([{ text: "Season." }]);

    const repaired = await callTool(db, "edit_recipe", {
      recipeId: "legacy",
      title: "Measured soup",
      ingredients: [{ quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " }],
    });
    expect(repaired.isError).toBeUndefined();
    expect(repaired.structuredContent).toMatchObject({
      title: "Measured soup",
      ingredients: [{ quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " }],
    });
  });

  it("imports safely parsed fractional and explicit COUNT measurements", async () => {
    const { db } = await setupDb();
    vi.mocked(parseRecipeFromUrl).mockResolvedValue({
      ok: true,
      data: {
        title: "Pancakes",
        sourceUrl: "https://example.test/pancakes",
        ingredients: ["1½ cups flour", "3 eggs"],
        instructions: ["Mix and cook."],
      },
    });

    const result = await callTool(db, "import_recipe_from_url", { url: "https://example.test/pancakes" });
    expect(result.isError).toBeUndefined();
    expect(await db.select().from(recipeIngredient).orderBy(recipeIngredient.sortOrder)).toMatchObject([
      { quantity: 1.5, unit: "CUP", displayText: "flour", rawText: "1½ cups flour" },
      { quantity: 3, unit: "COUNT", displayText: "eggs", rawText: "3 eggs" },
    ]);
  });
});
