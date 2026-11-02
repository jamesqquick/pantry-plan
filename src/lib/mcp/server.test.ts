import { afterEach, describe, expect, it, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport, type CallToolResult } from "@modelcontextprotocol/server";
import type { DatabaseSync } from "node:sqlite";
import { recipe, recipeIngredient, recipeInstruction, recipeSearchIndex, recipeTag, tag, user, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { createdRecipeOutputSchema } from "@/features/mcp/mcp.schemas";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { createServer, isRecipeAiSearchEnabled, RECIPE_AI_SEARCH_FLAG, type McpSearchContext } from "./server";
import { createMcpRecipe } from "./create-recipe";

vi.mock("@/lib/parse/parse-recipe", () => ({ parseRecipeFromUrl: vi.fn() }));

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const sqlite of databases.splice(0)) sqlite.close();
});

async function callTool(db: Db, name: string, input: Record<string, unknown>, search?: McpSearchContext) {
  const server = createServer(db, "cook", "https://quickpantry.test", undefined, search);
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
      result: { tools: Array<{ name: string; description: string; inputSchema: unknown; outputSchema: unknown }> };
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
  it("advertises optional tag names, edit semantics, and tag readback", async () => {
    const tools = await listTools();
    for (const name of ["create_recipe", "edit_recipe"]) {
      const tool = tools.find((listed) => listed.name === name);
      expect(tool?.description).toMatch(/tags as names/i);
      expect(tool?.inputSchema).toMatchObject({
        properties: {
          tags: {
            type: "array",
            maxItems: 100,
            items: { type: "string", minLength: 1, maxLength: 100 },
          },
        },
      });
      expect((tool?.inputSchema as { required: string[] }).required).not.toContain("tags");
    }
    expect(tools.find((tool) => tool.name === "edit_recipe")?.description).toMatch(/empty array to clear tags/i);
    for (const name of ["get_recipe", "edit_recipe"]) {
      const tool = tools.find((listed) => listed.name === name);
      expect(tool?.description).toMatch(/tag names/i);
      expect(tool?.outputSchema).toMatchObject({
        properties: { tags: { type: "array", items: { type: "string" } } },
        required: expect.arrayContaining(["tags"]),
      });
    }
  });

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

describe("MCP tag tools", () => {
  it.each([null, "Dinner", [42], [""], ["\t\n "], ["x".repeat(101)], Array(101).fill("Dinner")])("rejects malformed tag payloads without any recipe, tag, or index writes: %o", async (tags) => {
    const { db } = await setupDb();
    const saved = await createMcpRecipe(db, "cook", {
      title: "Original soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags: ["Original"],
    });
    const before = {
      recipes: await db.select().from(recipe),
      tags: await db.select().from(tag),
      associations: await db.select().from(recipeTag),
    };
    const search = { env: {} as McpSearchContext["env"] };
    const created = await callTool(db, "create_recipe", {
      title: "Rejected soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags,
    }, search);
    const edited = await callTool(db, "edit_recipe", { recipeId: saved.recipeId, title: "Rejected soup", tags }, search);

    expect(created.isError).toBe(true);
    expect(edited.isError).toBe(true);
    expect(await db.select().from(recipe)).toEqual(before.recipes);
    expect(await db.select().from(tag)).toEqual(before.tags);
    expect(await db.select().from(recipeTag)).toEqual(before.associations);
    expect(await db.select().from(recipeSearchIndex)).toEqual([]);
  });

  it("uploads changed tag names and removes cleared names from search documents", async () => {
    const { db } = await setupDb();
    const pending: Promise<unknown>[] = [];
    const upload = vi.fn(async (key: string, _content: unknown) => ({ id: "test-item", key, status: "queued" }) as AiSearchItemInfo);
    const search: McpSearchContext = {
      env: {
        AI_SEARCH: { get: () => ({ items: { upload } }) },
        AI_SEARCH_INSTANCE: "issue-102-test",
      } as unknown as McpSearchContext["env"],
      waitUntil: (promise) => { pending.push(promise); },
    };
    const created = await callTool(db, "create_recipe", {
      title: "Indexed soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags: ["Dinner"],
    }, search);
    expect(created.isError).toBeUndefined();
    const { recipeId } = createdRecipeOutputSchema.parse(created.structuredContent);
    await Promise.all(pending.splice(0));
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][1]).toContain("Tags: Dinner");

    expect((await callTool(db, "edit_recipe", { recipeId, tags: ["Quick"] }, search)).isError).toBeUndefined();
    await Promise.all(pending.splice(0));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][1]).toContain("Tags: Quick");
    expect(upload.mock.calls[1][1]).not.toContain("Dinner");

    expect((await callTool(db, "edit_recipe", { recipeId, tags: ["Quick", " Quick "] }, search)).isError).toBeUndefined();
    await Promise.all(pending.splice(0));
    expect(upload).toHaveBeenCalledTimes(2);

    expect((await callTool(db, "edit_recipe", { recipeId, tags: [] }, search)).isError).toBeUndefined();
    await Promise.all(pending.splice(0));
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[2][1]).not.toContain("Tags:");
    expect(upload.mock.calls[2][1]).not.toContain("Quick");
    expect(await db.select().from(recipeSearchIndex)).toMatchObject([{ recipeId, status: "indexed" }]);
  });

  it("creates, reads, replaces, preserves, and clears tags while queuing search synchronization", async () => {
    const { db } = await setupDb();
    const search = { env: {} as McpSearchContext["env"] };
    const created = await callTool(db, "create_recipe", {
      title: "Soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags: [" Soup ", "Dinner", "Soup"],
    }, search);
    expect(created.isError).toBeUndefined();
    const { recipeId } = createdRecipeOutputSchema.parse(created.structuredContent);
    const read = await callTool(db, "get_recipe", { recipeId }, search);
    expect(read.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({ tags: ["Dinner", "Soup"] });
    expect(await db.select().from(recipeSearchIndex)).toMatchObject([{ recipeId, userId: "cook", status: "pending", version: 1 }]);

    const edited = await callTool(db, "edit_recipe", { recipeId, tags: ["Quick", " Quick "] }, search);
    expect(edited.isError).toBeUndefined();
    expect(edited.structuredContent).toMatchObject({ tags: ["Quick"] });
    expect(await db.select().from(recipeSearchIndex)).toMatchObject([{ recipeId, status: "pending", version: 2 }]);
    expect((await callTool(db, "get_recipe", { recipeId })).structuredContent).toMatchObject({ tags: ["Quick"] });

    const unchanged = await callTool(db, "edit_recipe", { recipeId, notes: "Keep tags." }, search);
    expect(unchanged.isError).toBeUndefined();
    expect(unchanged.structuredContent).toMatchObject({ tags: ["Quick"] });

    const cleared = await callTool(db, "edit_recipe", { recipeId, tags: [] }, search);
    expect(cleared.isError).toBeUndefined();
    expect(cleared.structuredContent).toMatchObject({ tags: [] });
    expect((await callTool(db, "get_recipe", { recipeId })).structuredContent).toMatchObject({ tags: [] });
    expect(await db.select().from(recipeSearchIndex)).toMatchObject([{ recipeId, status: "pending", version: 4 }]);
  });

  it.each([undefined, []])("keeps existing create/edit calls working without tags: %o", async (tags) => {
    const { db } = await setupDb();
    const created = await callTool(db, "create_recipe", {
      title: "Soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags,
    });
    expect(created.isError).toBeUndefined();
    const { recipeId } = createdRecipeOutputSchema.parse(created.structuredContent);
    const edited = await callTool(db, "edit_recipe", { recipeId, title: "Updated soup", tags });
    expect(edited.isError).toBeUndefined();
    expect(edited.structuredContent).toMatchObject({ title: "Updated soup", tags: [] });
  });

  it("returns a tool error and does not queue search synchronization when a tag write fails", async () => {
    const { db, sqlite } = await setupDb();
    const saved = await createMcpRecipe(db, "cook", {
      title: "Soup",
      ingredients: [{ quantity: 1, unit: "CUP", displayText: "stock" }],
      instructions: ["Simmer."],
      tags: ["Dinner"],
    });
    const before = await db.select().from(recipeTag);
    sqlite.exec(`CREATE TRIGGER fail_tags BEFORE INSERT ON RecipeTag
      BEGIN SELECT RAISE(ABORT, 'injected tag failure'); END;`);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await callTool(db, "edit_recipe", { recipeId: saved.recipeId, tags: ["New"] }, {
      env: {} as McpSearchContext["env"],
    });

    expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "Could not edit the recipe." }] });
    expect(await db.select().from(recipeTag)).toEqual(before);
    expect(await db.select({ name: tag.name }).from(tag)).toEqual([{ name: "Dinner" }]);
    expect(await db.select().from(recipeSearchIndex)).toEqual([]);
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

  it("returns required measurements for saved recipes", async () => {
    const { db } = await setupDb();
    const saved = await createMcpRecipe(db, "cook", {
      title: "Measured soup",
      ingredients: [{ quantity: 1, unit: "TSP", displayText: "salt to taste" }],
      instructions: ["Season."],
    });

    const read = await callTool(db, "get_recipe", { recipeId: saved.recipeId });
    expect(read.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({
      title: "Measured soup",
      ingredients: [{ quantity: 1, unit: "TSP", displayText: "salt to taste" }],
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
