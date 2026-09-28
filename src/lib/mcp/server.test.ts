import { describe, expect, it } from "vitest";
import { createServer } from "./server";

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
