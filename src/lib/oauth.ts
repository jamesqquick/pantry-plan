import { getOAuthProviderApi, oauthProvider, type OAuthConsent } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { oauthConnection, oauthRefreshToken, session, type Db } from "@/db";
import { CHATGPT_CLIENT_ID, getOAuthUrls, MCP_GRANT_CLAIM, OAUTH_SCOPES } from "./oauth-config";
import { getOAuthGrantVersion } from "./oauth-connections";

export { CHATGPT_CLIENT_ID, MCP_SCOPES, OAUTH_SCOPES, getOAuthUrls } from "./oauth-config";

export function createOAuthPlugins(baseURL: string, db: Db) {
  const { issuer, resource } = getOAuthUrls(baseURL);
  const requireCurrentGrant = async (userId: string | undefined, referenceId: string | undefined | null) => {
    const connection = userId ? await db.query.oauthConnection.findFirst({ where: eq(oauthConnection.userId, userId) }) : null;
    if (!referenceId || referenceId !== connection?.version) {
      throw new APIError("BAD_REQUEST", { error: "invalid_grant", error_description: "Quick Pantry connection has been revoked." });
    }
  };
  const provider = oauthProvider({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    scopes: OAUTH_SCOPES,
    grantTypes: ["authorization_code", "refresh_token"],
    resources: [{ identifier: resource, name: "Quick Pantry MCP", allowedScopes: OAUTH_SCOPES }],
    clientRegistrationDefaultResources: [resource],
    enforcePerClientResources: true,
    disableJwtPlugin: true,
    accessTokenExpiresIn: 60 * 60,
    refreshTokenExpiresIn: 60 * 60 * 24 * 30,
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    generateClientId: () => CHATGPT_CLIENT_ID,
    clientReference: ({ user }) => user?.role === "ADMIN" ? CHATGPT_CLIENT_ID : undefined,
    clientPrivileges: ({ user }) => user?.role === "ADMIN",
    resourcePrivileges: ({ user }) => user?.role === "ADMIN",
    postLogin: {
      page: "/oauth/consent",
      shouldRedirect: () => false,
      consentReferenceId: ({ user }) => getOAuthGrantVersion(db, user.id),
    },
    customAccessTokenClaims: ({ referenceId }) => ({ [MCP_GRANT_CLAIM]: referenceId }),
    customTokenResponseFields: async ({ verificationValue, user }) => {
      if (verificationValue) await requireCurrentGrant(user?.id, verificationValue.referenceId);
      return {};
    },
  });

  const verifier = {
    id: "quick-pantry-mcp-auth" as const,
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path === "/oauth2/token" && ctx.body?.grant_type === "refresh_token",
        handler: createAuthMiddleware(async (ctx) => {
          if (typeof ctx.body?.refresh_token !== "string") return;
          const hash = await getOAuthProviderApi(ctx, provider.options).hashToken(ctx.body.refresh_token, "refresh_token");
          const token = await db.query.oauthRefreshToken.findFirst({ where: eq(oauthRefreshToken.token, hash) });
          if (!token) return;
          await requireCurrentGrant(token.userId, token.referenceId);
          if (token.sessionId) {
            const tokenSession = await db.query.session.findFirst({ where: eq(session.id, token.sessionId) });
            if (!tokenSession || tokenSession.expiresAt.getTime() <= Date.now()) {
              throw new APIError("BAD_REQUEST", { error: "invalid_grant", error_description: "Quick Pantry sign-in has expired. Reconnect ChatGPT." });
            }
          }
        }),
      }],
      after: [{
        matcher: (ctx) => ctx.path === "/.well-known/oauth-authorization-server" || ctx.path === "/.well-known/openid-configuration",
        handler: createAuthMiddleware(async (ctx) => {
          const metadata = z.looseObject({ token_endpoint_auth_methods_supported: z.array(z.string()) }).safeParse(ctx.context.returned);
          if (!metadata.success) return;
          // The provider infers public-client support from DCR, but our public client is pre-registered.
          ctx.setHeader("Access-Control-Allow-Origin", "*");
          return ctx.json({ ...metadata.data, token_endpoint_auth_methods_supported: [...new Set(["none", ...metadata.data.token_endpoint_auth_methods_supported])] });
        }),
      }],
    },
    endpoints: {
      verifyMcpAccessToken: createAuthEndpoint("/mcp/verify-token", {
        method: "POST",
        body: z.object({ token: z.string().min(1) }),
        metadata: { SERVER_ONLY: true },
      }, async (ctx) => {
        // This provider issues opaque tokens only; JWT-shaped input must not trigger JWKS lookup.
        if (ctx.body.token.includes(".")) throw new APIError("UNAUTHORIZED", { message: "Invalid MCP access token." });
        const payload = await getOAuthProviderApi(ctx, provider.options).requireActiveAccessToken(ctx.body.token);
        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
        if (payload.iss !== issuer || !audiences.includes(resource) || !payload.sub ||
            payload.client_id !== CHATGPT_CLIENT_ID || payload.token_type !== "Bearer" || payload.cnf) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid MCP access token." });
        }
        const connection = await db.query.oauthConnection.findFirst({ where: eq(oauthConnection.userId, payload.sub) });
        if (!connection || payload[MCP_GRANT_CLAIM] !== connection.version) {
          throw new APIError("UNAUTHORIZED", { message: "Quick Pantry connection has been revoked." });
        }
        const grants = await ctx.context.adapter.findMany<OAuthConsent<string[]>>({
          model: "oauthConsent",
          where: [{ field: "userId", value: payload.sub }, { field: "clientId", value: CHATGPT_CLIENT_ID }, { field: "referenceId", value: connection.version }],
        });
        if (!grants.some((grant) => grant.resources?.includes(resource) && scopes.every((scope) => grant.scopes.includes(scope)))) {
          throw new APIError("UNAUTHORIZED", { message: "Quick Pantry connection has been revoked." });
        }
        return { userId: payload.sub, scopes, clientId: CHATGPT_CLIENT_ID };
      }),
    },
  } satisfies BetterAuthPlugin;
  return [provider, verifier] as const;
}
