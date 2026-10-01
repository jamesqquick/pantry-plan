import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workersAiTextJson: vi.fn(),
}));

vi.mock("./workers-ai-client", () => ({
  workersAiTextJson: mocks.workersAiTextJson,
}));

import { suggestMappingsWithLLM } from "./llm-ingredient-mapping";

const lines = [
  { originalIndex: 2, text: "2 tomatoes" },
  { originalIndex: 5, text: "1 bunch scallions" },
];
const tomatoId = "cm1x9k2p40000qwerty7abc123";
const catalog = [
  { id: tomatoId, name: "Tomato", normalizedName: "tomato" },
];

describe("suggestMappingsWithLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps existing ingredients and creation suggestions", async () => {
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({
        mappings: [
          { lineIndex: 0, catalogIndex: 0, createName: "" },
          { lineIndex: 1, catalogIndex: -1, createName: "Scallion" },
        ],
      }),
    });

    const result = await suggestMappingsWithLLM({} as Ai, lines, catalog);

    expect(result).toEqual(
      new Map([
        [2, { ingredientId: tomatoId }],
        [5, { createName: "Scallion" }],
      ]),
    );
    const prompt = mocks.workersAiTextJson.mock.calls[0]?.[1] as string;
    expect(prompt).toContain("Catalog 0: tomato");
    expect(prompt).not.toContain(tomatoId);
    expect(mocks.workersAiTextJson).toHaveBeenCalledWith(
      {},
      expect.any(String),
      expect.objectContaining({
        jsonSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            mappings: expect.objectContaining({
              items: expect.objectContaining({
                required: ["lineIndex", "catalogIndex", "createName"],
                properties: expect.objectContaining({
                  lineIndex: { type: "integer", minimum: 0, maximum: 1 },
                  catalogIndex: {
                    type: "integer",
                    minimum: -1,
                    maximum: 0,
                  },
                  createName: { type: "string", maxLength: 500 },
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("asks AI for creation suggestions when the catalog is empty", async () => {
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({
        mappings: [{ lineIndex: 0, catalogIndex: -1, createName: "Sumac" }],
      }),
    });

    const result = await suggestMappingsWithLLM(
      {} as Ai,
      [{ originalIndex: 0, text: "sumac" }],
      [],
    );

    expect(result).toEqual(new Map([[0, { createName: "Sumac" }]]));
    expect(mocks.workersAiTextJson).toHaveBeenCalledOnce();
    const [prompt, options] = mocks.workersAiTextJson.mock.calls[0]!.slice(1);
    expect(prompt).toContain("Known ingredients:\n(none)");
    expect(options.jsonSchema.properties.mappings.items.properties.catalogIndex)
      .toEqual({ type: "integer", minimum: -1, maximum: -1 });
  });

  it("rejects invalid AI responses instead of silently returning no suggestions", async () => {
    mocks.workersAiTextJson.mockResolvedValue({ response: "not json" });

    await expect(
      suggestMappingsWithLLM({} as Ai, lines, catalog),
    ).rejects.toThrow("valid JSON");
  });

  it("rejects responses without any usable mappings", async () => {
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({ mappings: [] }),
    });

    await expect(
      suggestMappingsWithLLM({} as Ai, lines, catalog),
    ).rejects.toThrow("usable ingredient mappings");
  });

  it("keeps valid mappings when another item is malformed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({
        mappings: [
          { lineIndex: 0, catalogIndex: 0, createName: "" },
          { lineIndex: 1, catalogIndex: -1, createName: null },
        ],
      }),
    });

    const result = await suggestMappingsWithLLM({} as Ai, lines, catalog);

    expect(result).toEqual(new Map([[2, { ingredientId: tomatoId }]]));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalidMappings=1"),
    );
    warn.mockRestore();
  });

  it("keeps valid mappings when another catalog index is out of range", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({
        mappings: [
          { lineIndex: 0, catalogIndex: 0, createName: "" },
          { lineIndex: 1, catalogIndex: 4, createName: "" },
        ],
      }),
    });

    const result = await suggestMappingsWithLLM({} as Ai, lines, catalog);

    expect(result).toEqual(new Map([[2, { ingredientId: tomatoId }]]));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("outOfRangeCatalogIndexes=1"),
    );
    warn.mockRestore();
  });

  it("rejects creation mappings without a name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.workersAiTextJson.mockResolvedValue({
      response: JSON.stringify({
        mappings: [{ lineIndex: 0, catalogIndex: -1, createName: "  " }],
      }),
    });

    await expect(
      suggestMappingsWithLLM({} as Ai, [lines[0]!], catalog),
    ).rejects.toThrow("usable ingredient mappings");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalidMappings=1"),
    );
    warn.mockRestore();
  });

  it("batches large requests and preserves original indexes", async () => {
    const beforeRequest = vi.fn();
    const largeInput = Array.from({ length: 41 }, (_, originalIndex) => ({
      originalIndex: originalIndex * 2,
      text: `ingredient ${originalIndex}`,
    }));
    mocks.workersAiTextJson
      .mockResolvedValueOnce({
        response: JSON.stringify({
          mappings: Array.from({ length: 40 }, (_, lineIndex) => ({
            lineIndex,
            catalogIndex: -1,
            createName: `Ingredient ${lineIndex}`,
          })),
        }),
      })
      .mockResolvedValueOnce({
        response: JSON.stringify({
          mappings: [
            { lineIndex: 0, catalogIndex: -1, createName: "Ingredient 40" },
          ],
        }),
      });

    const result = await suggestMappingsWithLLM(
      {} as Ai,
      largeInput,
      [],
      beforeRequest,
    );

    expect(mocks.workersAiTextJson).toHaveBeenCalledTimes(2);
    expect(beforeRequest).toHaveBeenCalledTimes(2);
    expect(
      mocks.workersAiTextJson.mock.calls[0]?.[2].jsonSchema.properties.mappings
        .items.properties.lineIndex.maximum,
    ).toBe(39);
    expect(
      mocks.workersAiTextJson.mock.calls[1]?.[2].jsonSchema.properties.mappings
        .items.properties.lineIndex.maximum,
    ).toBe(0);
    expect(result).toHaveLength(41);
    expect(result.get(0)).toEqual({ createName: "Ingredient 0" });
    expect(result.get(80)).toEqual({ createName: "Ingredient 40" });
  });
});
