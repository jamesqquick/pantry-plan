import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { oauthAccessToken, oauthClient, oauthClientResource, oauthConnection, oauthConsent, oauthRefreshToken, verification, type Db } from "@/db";
import type { Auth } from "./auth";
import { CHATGPT_CLIENT_ID, getOAuthUrls, OAUTH_SCOPES } from "./oauth-config";

export async function getOAuthGrantVersion(db: Db, userId: string) {
  await db.insert(oauthConnection).values({ userId, version: crypto.randomUUID() }).onConflictDoNothing();
  const row = await db.query.oauthConnection.findFirst({ where: eq(oauthConnection.userId, userId) });
  return row!.version;
}

export async function getChatgptConnection(db: Db, userId: string) {
  const version = await db.query.oauthConnection.findFirst({ where: eq(oauthConnection.userId, userId) });
  if (!version) return null;
  const grant = await db.query.oauthConsent.findFirst({ where: and(
    eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, CHATGPT_CLIENT_ID), eq(oauthConsent.referenceId, version.version),
  ) });
  return grant ? { scopes: z.array(z.string()).parse(JSON.parse(grant.scopes)), connectedAt: grant.createdAt.toISOString() } : null;
}

export async function disconnectChatgpt(db: Db, userId: string) {
  // Rotate first in the same D1 batch: in-flight refreshes and pending codes retain the old version.
  await db.batch([
    db.insert(oauthConnection).values({ userId, version: crypto.randomUUID() }).onConflictDoUpdate({
      target: oauthConnection.userId, set: { version: crypto.randomUUID() },
    }),
    db.delete(oauthAccessToken).where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, CHATGPT_CLIENT_ID))),
    db.delete(oauthRefreshToken).where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, CHATGPT_CLIENT_ID))),
    db.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, CHATGPT_CLIENT_ID))),
    db.delete(verification).where(sql`CASE WHEN json_valid(${verification.value}) THEN
      json_extract(${verification.value}, '$.type') = 'authorization_code'
      AND json_extract(${verification.value}, '$.userId') = ${userId}
      AND json_extract(${verification.value}, '$.query.client_id') = ${CHATGPT_CLIENT_ID}
      ELSE 0 END`),
  ]);
}

export const chatgptRedirectUriSchema = z.url().max(2_048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "chatgpt.com" && !url.port && !url.username && !url.password && !url.search && !url.hash &&
    (url.pathname === "/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname));
}, "Paste the exact HTTPS redirect URI shown in ChatGPT's MCP server settings.");

export async function configureChatgptClient(db: Db, auth: Auth, headers: Headers, baseURL: string, redirectUri: string) {
  const { origin, resource } = getOAuthUrls(baseURL);
  const metadata = {
    client_name: "ChatGPT",
    redirect_uris: [chatgptRedirectUriSchema.parse(redirectUri)],
    application_type: "web" as const,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code" as const],
    require_pkce: true,
    skip_consent: false,
    scope: OAUTH_SCOPES.join(" "),
    client_uri: origin,
    policy_uri: `${origin}/privacy`,
    tos_uri: `${origin}/terms`,
  };
  const existing = await db.query.oauthClient.findFirst({ where: eq(oauthClient.clientId, CHATGPT_CLIENT_ID) });
  if (existing) {
    await auth.api.adminUpdateOAuthClient({ headers, body: { client_id: CHATGPT_CLIENT_ID, update: metadata } });
    const linked = await db.query.oauthClientResource.findFirst({ where: and(
      eq(oauthClientResource.clientId, CHATGPT_CLIENT_ID), eq(oauthClientResource.resourceId, resource),
    ) });
    if (!linked) await auth.api.adminLinkClientResource({ headers, params: { identifier: resource, client_id: CHATGPT_CLIENT_ID } });
  } else {
    await auth.api.adminCreateOAuthClient({ headers, body: { ...metadata, token_endpoint_auth_method: "none" } });
  }
  return { clientId: CHATGPT_CLIENT_ID, redirectUri };
}
