import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/log-llm", () => ({
  logLlmRequest: vi.fn(),
}));

import {
  WORKERS_AI_MODEL,
  workersAiTextJson,
  workersAiVisionJson,
} from "./workers-ai-client";

describe("workers AI client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Llama 4 Scout and forwards a JSON schema", async () => {
    const run = vi.fn().mockResolvedValue({
      response: { mappings: [] },
      usage: { total_tokens: 12 },
    });
    const jsonSchema = {
      type: "object",
      properties: { mappings: { type: "array" } },
      required: ["mappings"],
    } as const;

    const result = await workersAiTextJson(
      Object.assign({} as Ai, { run }),
      "Map ingredients",
      {
        jsonSchema,
        maxTokens: 256,
        temperature: 0,
      },
    );

    expect(WORKERS_AI_MODEL).toBe(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
    );
    expect(run).toHaveBeenCalledWith(
      WORKERS_AI_MODEL,
      {
        messages: [{ role: "user", content: "Map ingredients" }],
        response_format: { type: "json_schema", json_schema: jsonSchema },
        max_tokens: 256,
        temperature: 0,
      },
      {
        gateway: {
          id: "pantry-plan",
          skipCache: false,
          cacheTtl: 3600,
        },
      },
    );
    expect(result.response).toBe('{"mappings":[]}');
  });

  it("keeps vision requests compatible with the multimodal model", async () => {
    const run = vi.fn().mockResolvedValue({
      response: { title: "Tomato soup" },
    });

    const result = await workersAiVisionJson(
      Object.assign({} as Ai, { run }),
      new Uint8Array([1, 2, 3]).buffer,
      "image/png",
      "Extract the recipe",
    );

    expect(run).toHaveBeenCalledWith(
      WORKERS_AI_MODEL,
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the recipe" },
              {
                type: "image_url",
                image_url: {
                  url: expect.stringMatching(/^data:image\/png;base64,/),
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
      expect.any(Object),
    );
    expect(result.response).toBe('{"title":"Tomato soup"}');
  });
});
