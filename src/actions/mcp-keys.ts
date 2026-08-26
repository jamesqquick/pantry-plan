import { ActionError, defineAction } from "astro:actions";
import {
  createMcpApiKeySchema,
  revokeMcpApiKeySchema,
} from "@/features/mcp/mcp.schemas";
import {
  createMcpApiKey,
  McpApiKeyLimitError,
  McpApiKeyNotFoundError,
  revokeMcpApiKey,
} from "@/lib/mcp/api-keys";
import { getDb, requireUser } from "./_shared";

export const mcpKeys = {
  create: defineAction({
    input: createMcpApiKeySchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      try {
        return await createMcpApiKey(getDb(), user.id, input.name);
      } catch (error) {
        if (error instanceof McpApiKeyLimitError) {
          throw new ActionError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }
    },
  }),

  revoke: defineAction({
    input: revokeMcpApiKeySchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      try {
        return await revokeMcpApiKey(getDb(), user.id, input.id);
      } catch (error) {
        if (error instanceof McpApiKeyNotFoundError) {
          throw new ActionError({ code: "NOT_FOUND", message: "MCP key not found." });
        }
        throw error;
      }
    },
  }),
};
