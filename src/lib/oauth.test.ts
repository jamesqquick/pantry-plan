import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken, plannedMeal, recipe, session, user, verification } from "@/db";
import { createTestDb } from "@/test/d1";
import { createAuth } from "./auth";
import { CHATGPT_CLIENT_ID, getOAuthUrls, OAUTH_SCOPES } from "./oauth";
import { configureChatgptClient, disconnectChatgpt, getChatgptConnection } from "./oauth-connections";
import { createMcpApiKey, revokeMcpApiKey } from "./mcp/api-keys";
import { createMcpRecipe } from "./mcp/create-recipe";
import { handleMcpRequest } from "./mcp/server";

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) database.close();
});

const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
type Account = { id: string; email: string; password: string; cookie: string };
type Authorization = { url: URL; verifier: string };
type Grant = Authorization & { callback: URL };
type Tokens = { access_token: string; refresh_token: string; scope: string };

async function setup() {
  const { db, binding, sqlite } = createTestDb();
  databases.push(sqlite);
  const origin = "http://localhost:4321";
  const env = {
    DB: binding,
    AUTH_URL: origin,
    AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
    EMAIL: { send: async () => ({ messageId: "test" }) },
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    AI_RATE_LIMIT: undefined as RateLimit | undefined,
  };
  const auth = createAuth(env);
  const post = (path: string, body: unknown, cookie = "") => auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie, accept: "application/json" },
    body: JSON.stringify(body),
  }));

  async function signUp(email: string): Promise<Account> {
    const password = crypto.randomUUID();
    const response = await post("/sign-up/email", { name: email, email, password });
    expect(response.status).toBe(200);
    const body = await response.json() as { user: { id: string } };
    return { id: body.user.id, email, password, cookie: sessionCookie(response) };
  }

  async function authorization(overrides: Record<string, string> = {}): Promise<Authorization> {
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const url = new URL(`${origin}/api/auth/oauth2/authorize`);
    url.search = new URLSearchParams({
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAUTH_SCOPES.join(" "),
      resource: getOAuthUrls(origin).resource,
      state: crypto.randomUUID(),
      code_challenge: Buffer.from(digest).toString("base64url"),
      code_challenge_method: "S256",
      prompt: "consent",
      ...overrides,
    }).toString();
    return { url, verifier };
  }

  async function approve(account: Account, request: Authorization): Promise<Grant> {
    const response = await auth.handler(new Request(request.url, { headers: { cookie: account.cookie } }));
    const consent = new URL(response.headers.get("location")!, origin);
    expect(consent.pathname, consent.toString()).toBe("/oauth/consent");
    const accepted = await post("/oauth2/consent", { accept: true, oauth_query: consent.search.slice(1) }, account.cookie);
    expect(accepted.status).toBe(200);
    const body = await accepted.json() as { redirect: boolean; url: string };
    expect(body.redirect).toBe(true);
    const callback = new URL(body.url);
    expect(callback.searchParams.get("error")).toBeNull();
    expect(callback.searchParams.get("state")).toBe(request.url.searchParams.get("state"));
    return { ...request, callback };
  }

  const token = (body: Record<string, string>) => auth.handler(new Request(`${origin}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  }));
  const exchange = (grant: Grant, overrides: Record<string, string> = {}) => token({
    grant_type: "authorization_code",
    client_id: CHATGPT_CLIENT_ID,
    code: grant.callback.searchParams.get("code")!,
    redirect_uri: redirectUri,
    code_verifier: grant.verifier,
    resource: getOAuthUrls(origin).resource,
    ...overrides,
  });
  const refresh = (refreshToken: string, overrides: Record<string, string> = {}) => token({
    grant_type: "refresh_token",
    client_id: CHATGPT_CLIENT_ID,
    refresh_token: refreshToken,
    resource: getOAuthUrls(origin).resource,
    ...overrides,
  });

  async function connect(account: Account, scope = OAUTH_SCOPES.join(" ")) {
    const grant = await approve(account, await authorization({ scope }));
    const response = await exchange(grant);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json() as Promise<Tokens>;
  }

  async function mcp(accessToken: string | null, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    const pending: Promise<unknown>[] = [];
    const response = await handleMcpRequest(new Request(`${origin}/mcp`, {
      method: "POST",
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25",
        host: "localhost:4321",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }), db, env as unknown as Cloudflare.Env, {
      waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
    } as unknown as ExecutionContext);
    const text = await response.text();
    await Promise.all(pending);
    const data = text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    return { response, body: data ? JSON.parse(data) as unknown : text };
  }

  const admin = await signUp("admin@example.com");
  await db.update(user).set({ role: "ADMIN" }).where(eq(user.id, admin.id));
  await configureChatgptClient(db, auth, new Headers({ cookie: admin.cookie }), origin, redirectUri);
  const owner = await signUp("owner@example.com");
  return { db, auth, env, origin, post, signUp, authorization, approve, exchange, refresh, connect, mcp, admin, owner };
}

function sessionCookie(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("Quick Pantry OAuth", () => {
  it("runs signed email login, consent, PKCE exchange, and an authenticated MCP call", async () => {
    const { db, auth, origin, post, authorization, exchange, mcp, owner } = await setup();
    const request = await authorization({ scope: "recipes:read offline_access" });
    const started = await auth.handler(new Request(request.url));
    const login = new URL(started.headers.get("location")!, origin);
    expect(login.pathname, login.toString()).toBe("/login");
    const loggedIn = await post("/sign-in/email", { email: owner.email, password: owner.password, oauth_query: login.search.slice(1) });
    expect(loggedIn.status).toBe(200);
    const continued = await loggedIn.json() as { redirect: boolean; url: string };
    expect(continued.redirect).toBe(true);
    const consent = new URL(continued.url, origin);
    expect(consent.pathname).toBe("/oauth/consent");
    const cookie = sessionCookie(loggedIn);
    const accepted = await post("/oauth2/consent", { accept: true, oauth_query: consent.search.slice(1) }, cookie);
    expect(accepted.status).toBe(200);
    const acceptedBody = await accepted.json() as { redirect: boolean; url: string };
    expect(acceptedBody.redirect).toBe(true);
    const callback = new URL(acceptedBody.url);
    expect(callback.searchParams.get("state")).toBe(request.url.searchParams.get("state"));
    expect(callback.searchParams.get("iss")).toBe(getOAuthUrls(origin).issuer);
    const tokenResponse = await exchange({ ...request, callback });
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token: string; scope: string };
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.access_token.split(".")).toHaveLength(1);
    await expect(auth.api.verifyMcpAccessToken({ body: { token: tokens.access_token } })).resolves.toEqual({
      userId: owner.id,
      clientId: CHATGPT_CLIENT_ID,
      scopes: ["recipes:read", "offline_access"],
    });
    const saved = await createMcpRecipe(db, owner.id, {
      title: "Private tomato soup",
      ingredients: [{ displayText: "tomatoes" }],
      instructions: ["Simmer the tomatoes."],
    });
    const { response, body } = await mcp(tokens.access_token, "tools/call", { name: "get_recipe", arguments: { recipeId: saved.recipeId } });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ result: { structuredContent: { id: saved.recipeId, title: "Private tomato soup" } } });
  });

  it("keeps normal signup and login responses and protects publisher configuration", async () => {
    const { db, auth, origin, post, admin, owner } = await setup();
    const login = await post("/sign-in/email", { email: owner.email, password: owner.password });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ user: { id: owner.id } });
    await expect(configureChatgptClient(db, auth, new Headers({ cookie: owner.cookie }), origin, redirectUri)).rejects.toThrow();
    const nextRedirect = "https://chatgpt.com/connector/oauth/updated_123";
    await configureChatgptClient(db, auth, new Headers({ cookie: admin.cookie }), origin, nextRedirect);
    const clients = await db.query.oauthClient.findMany();
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ clientId: CHATGPT_CLIENT_ID, tokenEndpointAuthMethod: "none", clientSecret: null, requirePKCE: true, skipConsent: false });
    expect(JSON.parse(clients[0]!.redirectUris)).toEqual([nextRedirect]);
    const internal = await post("/mcp/verify-token", { token: "not-a-token" });
    expect(internal.status).toBe(404);
  });

  it("advertises pre-registered public-client support without opening dynamic registration", async () => {
    const { db, auth, post } = await setup();
    const metadata = await auth.api.getOAuthServerConfig();
    expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    expect(metadata.registration_endpoint).toBeUndefined();
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    const registration = await post("/oauth2/register", { client_name: "Untrusted client", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" });
    expect(registration.status).toBeGreaterThanOrEqual(400);
    expect(registration.status).toBeLessThan(500);
    expect(await db.query.oauthClient.findMany()).toHaveLength(1);
  });

  it("lets another administrator maintain the application-owned publisher client", async () => {
    const { db, auth, origin, signUp } = await setup();
    const administrator = await signUp("another-admin@example.com");
    await db.update(user).set({ role: "ADMIN" }).where(eq(user.id, administrator.id));
    const headers = new Headers({ cookie: administrator.cookie });
    const nextRedirect = "https://chatgpt.com/connector/oauth/another_admin";
    await configureChatgptClient(db, auth, headers, origin, nextRedirect);
    const client = await db.query.oauthClient.findFirst();
    expect(client).toMatchObject({ userId: null, referenceId: CHATGPT_CLIENT_ID });
    expect(JSON.parse(client!.redirectUris)).toEqual([nextRedirect]);

    await db.update(user).set({ role: "USER" }).where(eq(user.id, administrator.id));
    await expect(configureChatgptClient(db, auth, headers, origin, redirectUri)).rejects.toThrow();
    expect(JSON.parse((await db.query.oauthClient.findFirst())!.redirectUris)).toEqual([nextRedirect]);
  });

  it("rejects tampered signed consent and preserves state when consent is declined", async () => {
    const { db, auth, origin, post, authorization, owner } = await setup();
    const request = await authorization({ scope: "recipes:read offline_access" });
    const started = await auth.handler(new Request(request.url, { headers: { cookie: owner.cookie } }));
    const consent = new URL(started.headers.get("location")!, origin);
    const tampered = new URLSearchParams(consent.search);
    tampered.set("scope", OAUTH_SCOPES.join(" "));
    const invalid = await post("/oauth2/consent", { accept: true, oauth_query: tampered.toString() }, owner.cookie);
    expect(invalid.status).toBe(400);
    const declined = await post("/oauth2/consent", { accept: false, oauth_query: consent.search.slice(1) }, owner.cookie);
    expect(declined.status).toBe(200);
    const callback = new URL((await declined.json() as { url: string }).url);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe(request.url.searchParams.get("state"));
    expect(callback.searchParams.has("code")).toBe(false);
    expect(await db.query.oauthConsent.findMany()).toHaveLength(0);
    expect(await db.query.oauthAccessToken.findMany()).toHaveLength(0);
  });

  it.each([
    [{ resource: "https://other.example/mcp" }, "invalid_target"],
    [{ scope: "recipes:delete" }, "invalid_scope"],
    [{ code_challenge_method: "plain" }, "invalid_request"],
  ])("rejects invalid authorization parameters %j", async (overrides, error) => {
    const { db, auth, authorization, owner } = await setup();
    const request = await authorization(overrides);
    const response = await auth.handler(new Request(request.url, { headers: { cookie: owner.cookie } }));
    expect(response.status).toBeLessThan(500);
    expect(response.headers.get("location") ?? await response.text()).toContain(error);
    expect(await db.query.oauthAccessToken.findMany()).toHaveLength(0);
    expect(await db.query.oauthConsent.findMany()).toHaveLength(0);
  });

  it("never redirects an authorization result to an unregistered callback", async () => {
    const { auth, origin, authorization, owner } = await setup();
    const request = await authorization({ redirect_uri: "https://unregistered.example/callback" });
    const response = await auth.handler(new Request(request.url, { headers: { cookie: owner.cookie } }));
    expect(response.status).toBe(302);
    const errorPage = new URL(response.headers.get("location")!, origin);
    expect(errorPage.origin).toBe(origin);
    expect(errorPage.searchParams.get("error")).toBe("invalid_redirect");
    expect(errorPage.searchParams.has("code")).toBe(false);
  });

  it("checks PKCE and callback binding, consumes codes once, and rejects code replay", async () => {
    const { authorization, approve, exchange, connect, mcp, owner } = await setup();
    const wrongVerifier = await approve(owner, await authorization());
    expect((await exchange(wrongVerifier, { code_verifier: crypto.randomUUID() + crypto.randomUUID() })).status).toBe(401);
    const wrongCallback = await approve(owner, await authorization());
    expect((await exchange(wrongCallback, { redirect_uri: "https://chatgpt.com/connector/oauth/not_registered" })).status).toBe(400);
    const grant = await approve(owner, await authorization());
    const response = await exchange(grant);
    expect(response.status).toBe(200);
    const tokens = await response.json() as Tokens;
    expect((await exchange(grant)).status).toBe(400);
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    expect((await connect(owner)).access_token).toBeTruthy();
  });

  it("rotates refresh tokens, disallows added scopes/resources, and detects refresh replay", async () => {
    const { connect, refresh, mcp, owner } = await setup();
    const initial = await connect(owner, "recipes:read offline_access");
    const widened = await refresh(initial.refresh_token, { scope: "recipes:read recipes:write offline_access" });
    expect(widened.status).toBe(400);
    expect(await widened.json()).toMatchObject({ error: "invalid_scope" });
    const otherResource = await refresh(initial.refresh_token, { resource: "https://other.example/mcp" });
    expect(otherResource.status).toBe(400);
    expect(await otherResource.json()).toMatchObject({ error: "invalid_target" });
    const rotated = await refresh(initial.refresh_token);
    expect(rotated.status).toBe(200);
    const current = await rotated.json() as Tokens;
    expect(current.refresh_token).not.toBe(initial.refresh_token);
    expect(current.access_token).not.toBe(initial.access_token);
    expect(current.scope).toBe("recipes:read offline_access");
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(200);
    expect((await refresh(initial.refresh_token)).status).toBe(400);
    expect((await refresh(current.refresh_token)).status).toBe(400);
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(401);
  });

  it("rejects expired access/refresh tokens and tokens for a disabled client", async () => {
    const { db, connect, refresh, mcp, owner } = await setup();
    const initial = await connect(owner);
    await db.update(oauthAccessToken).set({ expiresAt: new Date(Date.now() - 1_000) });
    expect((await mcp(initial.access_token, "tools/list")).response.status).toBe(401);
    const response = await refresh(initial.refresh_token);
    expect(response.status).toBe(200);
    const current = await response.json() as Tokens;
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(200);
    await db.update(oauthRefreshToken).set({ expiresAt: new Date(Date.now() - 1_000) });
    expect((await refresh(current.refresh_token)).status).toBe(400);
    await db.update(oauthClient).set({ disabled: true });
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(401);
  });

  it("requires reauthorization instead of issuing unusable tokens after session expiry", async () => {
    const { db, connect, refresh, mcp, owner } = await setup();
    const tokens = await connect(owner);
    const stored = await db.query.oauthRefreshToken.findFirst({ where: eq(oauthRefreshToken.userId, owner.id) });
    expect(stored?.sessionId).toBeTruthy();
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(session.id, stored!.sessionId!));
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    const response = await refresh(tokens.refresh_token);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("advertises exactly six tools with input/output contracts and matching security metadata", async () => {
    const { connect, mcp, owner } = await setup();
    const tokens = await connect(owner);
    const { response, body } = await mcp(tokens.access_token, "tools/list");
    expect(response.status).toBe(200);
    const expected = [
      ["create_recipe", "recipes:write", false, false, false, false],
      ["get_recipe", "recipes:read", true, false, true, false],
      ["edit_recipe", "recipes:write", false, true, true, false],
      ["import_recipe_from_url", "recipes:write", false, false, false, true],
      ["search_recipes", "recipes:read", false, false, true, false],
      ["create_weekly_meal_plan", "meal-plans:write", false, true, true, false],
    ] as const;
    expect(body).toMatchObject({ result: { tools: expected.map(([name, scope, readOnlyHint, destructiveHint, idempotentHint, openWorldHint]) => ({
      name,
      title: expect.any(String),
      inputSchema: { type: "object", additionalProperties: false },
      outputSchema: { type: "object", additionalProperties: false },
      securitySchemes: [{ type: "oauth2", scopes: [scope] }],
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [scope] }] },
      annotations: { readOnlyHint, destructiveHint, idempotentHint, openWorldHint },
    })) } });
    expect((body as { result: { tools: unknown[] } }).result.tools).toHaveLength(6);
  });

  it("guards every tool before reading, fetching, or changing data without its scope", async () => {
    const { db, connect, mcp, owner } = await setup();
    const saved = await createMcpRecipe(db, owner.id, { title: "Keep this recipe", ingredients: [{ displayText: "tomatoes" }], instructions: ["Simmer."] });
    await db.insert(plannedMeal).values({ userId: owner.id, recipeId: saved.recipeId, date: new Date("2026-09-06T00:00:00Z"), mealSlot: "DINNER" });
    const beforeMeals = await db.query.plannedMeal.findMany();
    const beforeRecipes = await db.query.recipe.findMany();
    const tokens = await connect(owner, "offline_access");
    const fetch = vi.spyOn(globalThis, "fetch");
    const calls = [
      ["get_recipe", "recipes:read", { recipeId: saved.recipeId }],
      ["search_recipes", "recipes:read", { query: "Keep" }],
      ["create_recipe", "recipes:write", { title: "Unapproved", ingredients: [{ displayText: "beans" }], instructions: ["Cook."] }],
      ["edit_recipe", "recipes:write", { recipeId: saved.recipeId, title: "Unapproved" }],
      ["import_recipe_from_url", "recipes:write", { url: "https://example.com/recipe" }],
      ["create_weekly_meal_plan", "meal-plans:write", { weekStart: "2026-09-06", meals: [] }],
    ] as const;
    for (const [name, scope, input] of calls) {
      const { response, body } = await mcp(tokens.access_token, "tools/call", { name, arguments: input });
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ result: {
        isError: true,
        _meta: { "mcp/www_authenticate": [expect.stringContaining(`scope="${scope}"`)] },
      } });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(await db.query.recipe.findMany()).toEqual(beforeRecipes);
    expect(await db.query.plannedMeal.findMany()).toEqual(beforeMeals);
  });

  it("isolates recipe search, reads, edits, and meal planning between linked accounts", async () => {
    const { db, signUp, connect, mcp, owner } = await setup();
    const other = await signUp("other@example.com");
    const ownerTokens = await connect(owner);
    const otherTokens = await connect(other);
    const saved = await createMcpRecipe(db, other.id, { title: "Other account secret recipe", ingredients: [{ displayText: "Private ingredient" }], instructions: ["Private instruction."] });
    const search = await mcp(ownerTokens.access_token, "tools/call", { name: "search_recipes", arguments: { query: "secret" } });
    expect(search.body).toMatchObject({ result: { structuredContent: { count: 0, recipes: [] } } });
    for (const [name, input] of [
      ["get_recipe", { recipeId: saved.recipeId }],
      ["edit_recipe", { recipeId: saved.recipeId, title: "Stolen recipe" }],
      ["create_weekly_meal_plan", { weekStart: "2026-09-06", meals: [{ date: "2026-09-06", mealSlot: "DINNER", recipeId: saved.recipeId }] }],
    ] as const) {
      const { body } = await mcp(ownerTokens.access_token, "tools/call", { name, arguments: input });
      expect(body).toMatchObject({ result: { isError: true } });
      expect(JSON.stringify(body)).not.toContain("Other account secret recipe");
    }
    expect(await db.query.plannedMeal.findMany()).toHaveLength(0);
    expect(await db.query.recipe.findFirst({ where: eq(recipe.id, saved.recipeId) })).toMatchObject({ userId: other.id, title: "Other account secret recipe" });
    const owned = await mcp(otherTokens.access_token, "tools/call", { name: "get_recipe", arguments: { recipeId: saved.recipeId } });
    expect(owned.body).toMatchObject({ result: { structuredContent: { id: saved.recipeId, title: "Other account secret recipe" } } });
    const forgedOwner = await mcp(ownerTokens.access_token, "tools/call", { name: "get_recipe", arguments: { recipeId: saved.recipeId, userId: other.id } });
    expect(forgedOwner.body).toMatchObject({ result: { isError: true } });
  });

  it("disconnects access, refresh, and pending codes without affecting another account or reviving old credentials", async () => {
    const { db, signUp, connect, authorization, approve, exchange, refresh, mcp, owner } = await setup();
    const other = await signUp("other@example.com");
    const tokens = await connect(owner);
    const otherTokens = await connect(other);
    const pending = await approve(owner, await authorization());
    expect(await getChatgptConnection(db, owner.id)).toMatchObject({ scopes: OAUTH_SCOPES });
    await disconnectChatgpt(db, owner.id);
    expect(await getChatgptConnection(db, owner.id)).toBeNull();
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    expect((await exchange(pending)).status).toBe(400);
    expect((await mcp(otherTokens.access_token, "tools/list")).response.status).toBe(200);
    const reconnected = await connect(owner);
    expect((await mcp(reconnected.access_token, "tools/list")).response.status).toBe(200);
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    expect((await exchange(pending)).status).toBe(400);
  });

  it("rejects stale-version credentials that finish persisting after disconnect", async () => {
    const { db, connect, authorization, approve, exchange, refresh, mcp, owner } = await setup();
    const tokens = await connect(owner);
    const pending = await approve(owner, await authorization());
    const accessRows = await db.query.oauthAccessToken.findMany();
    const refreshRows = await db.query.oauthRefreshToken.findMany();
    const consentRows = await db.query.oauthConsent.findMany();
    const codeRows = (await db.query.verification.findMany()).filter((row) => JSON.parse(row.value).type === "authorization_code");
    await disconnectChatgpt(db, owner.id);
    // Model a provider request that loaded the old grant before the disconnect batch.
    await db.insert(oauthRefreshToken).values(refreshRows);
    await db.insert(oauthAccessToken).values(accessRows);
    await db.insert(oauthConsent).values(consentRows);
    await db.insert(verification).values(codeRows);
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    expect((await exchange(pending)).status).toBe(400);
    const current = await connect(owner);
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(200);
    expect((await mcp(tokens.access_token, "tools/list")).response.status).toBe(401);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    expect((await mcp(current.access_token, "tools/list")).response.status).toBe(200);
  });

  it("keeps legacy MCP keys working independently of OAuth disconnect", async () => {
    const { db, connect, mcp, owner } = await setup();
    await connect(owner);
    const key = await createMcpApiKey(db, owner.id, "Existing client");
    await disconnectChatgpt(db, owner.id);
    const created = await mcp(key.token, "tools/call", { name: "create_recipe", arguments: { title: "Legacy client recipe", ingredients: [{ displayText: "beans" }], instructions: ["Cook the beans."] } });
    expect(created.response.status).toBe(200);
    expect(created.body).toMatchObject({ result: { structuredContent: { title: "Legacy client recipe" } } });
    expect(await db.query.recipe.findFirst({ where: eq(recipe.userId, owner.id) })).toMatchObject({ title: "Legacy client recipe" });
    await revokeMcpApiKey(db, owner.id, key.id);
    expect((await mcp(key.token, "tools/list")).response.status).toBe(401);
  });

  it("uses the account ID for rate limits across access-token refresh", async () => {
    const { env, connect, refresh, mcp, owner } = await setup();
    const limit = vi.fn(async () => ({ success: true }));
    env.AI_RATE_LIMIT = { limit };
    const initial = await connect(owner, "recipes:read offline_access");
    await mcp(initial.access_token, "tools/call", { name: "search_recipes", arguments: { query: "tomatoes" } });
    const response = await refresh(initial.refresh_token);
    expect(response.status).toBe(200);
    const current = await response.json() as Tokens;
    await mcp(current.access_token, "tools/call", { name: "search_recipes", arguments: { query: "tomatoes" } });
    expect(limit.mock.calls).toEqual([[{ key: `mcp:${owner.id}` }], [{ key: `mcp:${owner.id}` }]]);
  });

  it("challenges invalid/missing bearer credentials and never authenticates MCP with browser cookies", async () => {
    const { mcp, owner } = await setup();
    for (const token of [null, "not-a-token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.invalid", "pp_mcp_invalid"]) {
      const { response } = await mcp(token, "tools/list", {}, { cookie: owner.cookie });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('resource_metadata="http://localhost:4321/.well-known/oauth-protected-resource/mcp"');
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
