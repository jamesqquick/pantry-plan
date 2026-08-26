import { describe, expect, it } from "vitest";
import {
  createMcpApiKeyToken,
  getBearerToken,
  hashMcpApiKey,
} from "./api-keys";

describe("MCP API keys", () => {
  it("creates distinct prefixed tokens and stable hashes", async () => {
    const first = createMcpApiKeyToken();
    const second = createMcpApiKeyToken();

    expect(first).toMatch(/^pp_mcp_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(await hashMcpApiKey(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashMcpApiKey(first)).toBe(await hashMcpApiKey(first));
  });

  it("reads a valid bearer token", () => {
    expect(getBearerToken("Bearer pp_mcp_abc123")).toBe("pp_mcp_abc123");
  });

  it.each([null, "", "Basic abc", "Bearer", "bearer abc", "Bearer  abc"])(
    "rejects malformed authorization header %j",
    (header) => {
      expect(getBearerToken(header)).toBeNull();
    },
  );
});
