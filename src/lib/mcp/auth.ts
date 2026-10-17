import { isAPIError } from "better-auth/api";
import type { Db } from "@/db";
import { createAuth } from "@/lib/auth";
import { getOAuthUrls, MCP_SCOPES } from "@/lib/oauth";
import { authenticateMcpApiKey, getBearerToken } from "./api-keys";

export function mcpAuthChallenge(baseURL: string, scope?: string) {
  const { resourceMetadata } = getOAuthUrls(baseURL);
  return `Bearer resource_metadata="${resourceMetadata}", scope="${scope ?? MCP_SCOPES.join(" ")}", error="${scope ? "insufficient_scope" : "invalid_token"}", error_description="${scope ? "Reconnect Quick Pantry to grant the required permission." : "Connect your Quick Pantry account to continue."}"`;
}

export async function authenticateMcpRequest(db: Db, env: Cloudflare.Env, request: Request) {
  const authorization = request.headers.get("Authorization");
  const token = getBearerToken(authorization);
  if (!token) return null;
  if (token.startsWith("pp_mcp_")) {
    const key = await authenticateMcpApiKey(db, authorization);
    return key ? { userId: key.userId, scopes: [...MCP_SCOPES] } : null;
  }
  try {
    return await createAuth(env).api.verifyMcpAccessToken({ body: { token } });
  } catch (error) {
    if (isAPIError(error) && [400, 401, 403].includes(error.statusCode)) return null;
    throw error;
  }
}
