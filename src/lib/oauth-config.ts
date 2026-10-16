export const CHATGPT_CLIENT_ID = "quick-pantry-chatgpt";
export const MCP_SCOPES = ["recipes:read", "recipes:write", "meal-plans:write"] as const;
export const OAUTH_SCOPES = [...MCP_SCOPES, "offline_access"];
export const MCP_GRANT_CLAIM = "https://quickpantry.app/oauth/grant";
export const OAUTH_SCOPE_LABELS: Record<string, string> = {
  "recipes:read": "Search and read your saved recipes.",
  "recipes:write": "Create, edit, and import recipes into your account.",
  "meal-plans:write": "Replace or clear a full week of planned meals using your saved recipes.",
  offline_access: "Stay connected using refresh tokens without signing in for each request.",
};

export function getOAuthUrls(baseURL: string) {
  const origin = new URL(baseURL).origin;
  return {
    origin,
    issuer: `${origin}/api/auth`,
    resource: `${origin}/mcp`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource/mcp`,
  };
}
