import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { session, user } from "./users";

// Better Auth's SQLite adapter serializes arrays and JSON to plain TEXT.
export const oauthClient = sqliteTable("oauthClient", {
  id: cuidPk(),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  clientDiscoveryId: text("clientDiscoveryId"),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  skipConsent: integer("skipConsent", { mode: "boolean" }),
  enableEndSession: integer("enableEndSession", { mode: "boolean" }),
  subjectType: text("subjectType"),
  scopes: text("scopes"),
  clientCredentialsScopes: text("clientCredentialsScopes"),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts"),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("softwareId"),
  softwareVersion: text("softwareVersion"),
  softwareStatement: text("softwareStatement"),
  redirectUris: text("redirectUris").notNull(),
  postLogoutRedirectUris: text("postLogoutRedirectUris"),
  backchannelLogoutUri: text("backchannelLogoutUri"),
  backchannelLogoutSessionRequired: integer("backchannelLogoutSessionRequired", { mode: "boolean" }),
  tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
  applicationType: text("applicationType"),
  jwks: text("jwks"),
  jwksUri: text("jwksUri"),
  grantTypes: text("grantTypes"),
  responseTypes: text("responseTypes"),
  requirePKCE: integer("requirePKCE", { mode: "boolean" }),
  dpopBoundAccessTokens: integer("dpopBoundAccessTokens", { mode: "boolean" }).default(false),
  referenceId: text("referenceId"),
  metadata: text("metadata"),
}, (t) => [index("oauthClient_userId_idx").on(t.userId)]);

export const oauthResource = sqliteTable("oauthResource", {
  id: cuidPk(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("accessTokenTtl"),
  refreshTokenTtl: integer("refreshTokenTtl"),
  signingAlgorithm: text("signingAlgorithm"),
  signingKeyId: text("signingKeyId"),
  allowedScopes: text("allowedScopes"),
  customClaims: text("customClaims"),
  dpopBoundAccessTokensRequired: integer("dpopBoundAccessTokensRequired", { mode: "boolean" }).default(false),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  policyVersion: integer("policyVersion").default(1),
  metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable("oauthClientResource", {
  id: cuidPk(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resourceId").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: text("metadata"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("oauthClientResource_client_resource_key").on(t.clientId, t.resourceId)]);

export const oauthRefreshToken = sqliteTable("oauthRefreshToken", {
  id: cuidPk(),
  token: text("token").notNull().unique(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  authorizationCodeId: text("authorizationCodeId"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requestedUserInfoClaims"),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  revoked: integer("revoked", { mode: "timestamp_ms" }),
  rotatedAt: integer("rotatedAt", { mode: "timestamp_ms" }),
  rotationReplayResponse: text("rotationReplayResponse"),
  rotationReplayExpiresAt: integer("rotationReplayExpiresAt", { mode: "timestamp_ms" }),
  authTime: integer("authTime", { mode: "timestamp_ms" }),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
}, (t) => [
  index("oauthRefreshToken_user_client_idx").on(t.userId, t.clientId),
  index("oauthRefreshToken_authorizationCodeId_idx").on(t.authorizationCodeId),
]);

export const oauthAccessToken = sqliteTable("oauthAccessToken", {
  id: cuidPk(),
  token: text("token").notNull().unique(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  authorizationCodeId: text("authorizationCodeId"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requestedUserInfoClaims"),
  refreshId: text("refreshId").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  revoked: integer("revoked", { mode: "timestamp_ms" }),
  confirmation: text("confirmation"),
  scopes: text("scopes").notNull(),
}, (t) => [
  index("oauthAccessToken_user_client_idx").on(t.userId, t.clientId),
  index("oauthAccessToken_refreshId_idx").on(t.refreshId),
  index("oauthAccessToken_authorizationCodeId_idx").on(t.authorizationCodeId),
]);

export const oauthConsent = sqliteTable("oauthConsent", {
  id: cuidPk(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  resources: text("resources"),
  requestedUserInfoClaims: text("requestedUserInfoClaims"),
  scopes: text("scopes").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("oauthConsent_user_client_idx").on(t.userId, t.clientId)]);

export const oauthClientAssertion = sqliteTable("oauthClientAssertion", {
  id: cuidPk(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
});

export const oauthConnection = sqliteTable("oauthConnection", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
});
