import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createAuth } from "@/lib/auth";
import { getOAuthUrls, MCP_SCOPES } from "@/lib/oauth-config";

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const path = params.path;
  if (path === "oauth-authorization-server" || path === "oauth-authorization-server/api/auth") {
    return oauthProviderAuthServerMetadata(createAuth(env), { headers: { "Access-Control-Allow-Origin": "*" } })(request);
  }
  if (path === "oauth-protected-resource" || path === "oauth-protected-resource/mcp") {
    const { origin, issuer, resource } = getOAuthUrls(env.AUTH_URL);
    return Response.json({
      resource,
      resource_name: "Quick Pantry",
      authorization_servers: [issuer],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/support`,
      resource_policy_uri: `${origin}/privacy`,
      resource_tos_uri: `${origin}/terms`,
    }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
  }
  if (path === "openai-apps-challenge" && env.OPENAI_APPS_CHALLENGE) {
    return new Response(env.OPENAI_APPS_CHALLENGE, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response("Not found", { status: 404 });
};

export const OPTIONS: APIRoute = () => new Response(null, {
  status: 204,
  headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" },
});
