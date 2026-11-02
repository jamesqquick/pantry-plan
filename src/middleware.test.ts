import type { APIContext, MiddlewareHandler } from "astro";
import { inspect } from "node:util";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createDb, recipe, session } from "@/db";
import { getDatabaseBudget } from "@/lib/database-timeout";
import { DATABASE_UNAVAILABLE_MESSAGE, DATABASE_WRITE_UNCERTAIN_MESSAGE } from "@/lib/database-unavailable";
import * as auth from "@/lib/auth";
import { createTestDb } from "@/test/d1";
import { onRequest } from "./middleware";
import { ALL } from "./pages/api/auth/[...all]";

const runtime = vi.hoisted(() => ({ env: {} as Cloudflare.Env }));
vi.mock("cloudflare:workers", () => ({ env: runtime.env }));
vi.mock("astro:middleware", () => ({
  defineMiddleware: (middleware: MiddlewareHandler) => middleware,
}));
vi.mock("astro:actions", async () => {
  const { getActionContext } = await import("../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../node_modules/astro/dist/actions/runtime/client.js");
  return { getActionContext, ActionError };
});

class DatabaseUnavailableError extends Error {
  constructor() {
    super("D1 is unavailable");
    this.name = "DatabaseUnavailableError";
  }
}

let test: ReturnType<typeof createTestDb>;
let createAuth: MockInstance<typeof auth.createAuth>;

beforeEach(() => {
  test = createTestDb();
  Object.assign(runtime.env, {
    DB: test.binding,
    AUTH_URL: "https://quickpantry.app",
    AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  });
  createAuth = vi.spyOn(auth, "createAuth");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  test.sqlite.close();
});

function stallDatabase() {
  const prototype = Object.getPrototypeOf(test.binding.prepare("SELECT 1"));
  for (const method of ["raw", "all", "first", "run"]) {
    vi.spyOn(prototype, method).mockImplementation(() => new Promise(() => {}));
  }
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
}

function request(path: string, init: RequestInit = {}) {
  const url = new URL(path, runtime.env.AUTH_URL);
  const context = {
    request: new Request(url, init),
    url,
    isPrerendered: false,
    locals: { user: null, session: null },
    redirect: vi.fn((location: string) => new Response(null, {
      status: 302,
      headers: { location },
    })),
  } as unknown as APIContext;
  const rendered = new Response("Rendered page");
  const next = vi.fn(async () => rendered);
  return { context, rendered, next };
}

const account = { name: "Cook", email: "cook@example.test", password: crypto.randomUUID() };

async function signUp() {
  const response = await auth.createAuth(runtime.env).handler(new Request(
    new URL("/api/auth/sign-up/email", runtime.env.AUTH_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: runtime.env.AUTH_URL },
      body: JSON.stringify(account),
    },
  ));
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token=");
  createAuth.mockClear();
  return cookie;
}

describe("browser session middleware", () => {
  it.each(["/", "/login", "/register", "/forgot-password", "/reset-password", "/privacy", "/terms", "/support"])(
    "renders %s without initializing auth when D1 is unavailable and no session cookie exists",
    async (path) => {
      const prepare = vi.spyOn(test.binding, "prepare").mockImplementation(() => {
        throw new DatabaseUnavailableError();
      });
      const { context, next, rendered } = request(path);

      expect(await onRequest(context, next)).toBe(rendered);
      expect(context.locals.user).toBeNull();
      expect(context.locals.session).toBeNull();
      expect(createAuth).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it.each([
    "analytics=visitor; theme=dark",
    "better-auth.session_data=cached-data; better-auth.dont_remember=true",
    "other.better-auth.session_token=unrelated",
    "better-auth.session_token=",
  ])("does not initialize auth for unrelated or empty cookies: %s", async (cookie) => {
    const { context, next, rendered } = request("/login", { headers: { cookie } });

    expect(await onRequest(context, next)).toBe(rendered);
    expect(context.locals.session).toBeNull();
    expect(createAuth).not.toHaveBeenCalled();
  });

  it.each(["/recipes", "/recipes?tag=quick&search=tomato%20soup", "/profile"])(
    "redirects anonymous requests for %s with the existing next parameter",
    async (path) => {
      const { context, next } = request(path);
      const response = await onRequest(context, next);

      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe(`/login?next=${encodeURIComponent(path)}`);
      expect(next).not.toHaveBeenCalled();
      expect(createAuth).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["http://localhost:4321", "better-auth.session_token"],
    ["https://quickpantry.app", "__Secure-better-auth.session_token"],
  ])("validates a real session using %s and %s", async (origin, cookieName) => {
    Object.assign(runtime.env, { AUTH_URL: origin });
    const cookie = await signUp();
    expect(cookie).toContain(`${cookieName}=`);
    const { context, next, rendered } = request("/recipes", { headers: { cookie } });

    expect(await onRequest(context, next)).toBe(rendered);
    expect(createAuth).toHaveBeenCalledExactlyOnceWith(runtime.env, undefined);
    expect(context.locals.user?.email).toBe(account.email);
    expect(context.locals.session?.userId).toBe(context.locals.user?.id);
  });

  it.each([
    ["http://localhost:4321", "better-auth.session_token"],
    ["https://quickpantry.app", "__Secure-better-auth.session_token"],
  ])(
    "does not trust an invalid cookie using %s and %s",
    async (origin, cookieName) => {
      Object.assign(runtime.env, { AUTH_URL: origin });
      const { context, next } = request("/recipes", { headers: { cookie: `${cookieName}=invalid` } });
      const response = await onRequest(context, next);

      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe("/login?next=%2Frecipes");
      expect(createAuth).toHaveBeenCalledOnce();
      expect(context.locals.user).toBeNull();
      expect(context.locals.session).toBeNull();
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("rejects an expired session even when its cookie is correctly signed", async () => {
    const cookie = await signUp();
    await test.db.update(session).set({ expiresAt: new Date(Date.now() - 1_000) });
    const { context, next } = request("/profile", { headers: { cookie } });

    expect((await onRequest(context, next))?.headers.get("location")).toBe("/login?next=%2Fprofile");
    expect(createAuth).toHaveBeenCalledOnce();
    expect(context.locals.user).toBeNull();
    expect(context.locals.session).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("still validates cookie-bearing requests when D1 becomes unavailable", async () => {
    const cookie = await signUp();
    const unavailable = new DatabaseUnavailableError();
    const prepare = vi.spyOn(test.binding, "prepare").mockImplementation(() => { throw unavailable; });
    const { context, next } = request("/recipes", { headers: { cookie } });

    await expect(onRequest(context, next)).rejects.toThrow(DatabaseUnavailableError);
    expect(createAuth).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalled();
    expect(context.locals.session).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["/login", "/register"])("keeps authenticated redirects and signed OAuth requests for %s", async (path) => {
    const cookie = await signUp();
    const normal = request(path, { headers: { cookie } });
    expect((await onRequest(normal.context, normal.next))?.headers.get("location")).toBe("/recipes");
    expect(normal.next).not.toHaveBeenCalled();

    const oauth = request(`${path}?sig=signed-oauth-query`, { headers: { cookie } });
    expect(await onRequest(oauth.context, oauth.next)).toBe(oauth.rendered);
    expect(oauth.context.locals.session).not.toBeNull();
  });

  it.each(["/mcp", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp"])(
    "bypasses browser auth for %s even with a session cookie",
    async (path) => {
      const { context, next, rendered } = request(path, { headers: { cookie: "better-auth.session_token=invalid" } });
      expect(await onRequest(context, next)).toBe(rendered);
      expect(createAuth).not.toHaveBeenCalled();
    },
  );

  it("bypasses browser auth during prerendering", async () => {
    const { context, next, rendered } = request("/privacy", { headers: { cookie: "better-auth.session_token=invalid" } });
    context.isPrerendered = true;
    expect(await onRequest(context, next)).toBe(rendered);
    expect(createAuth).not.toHaveBeenCalled();
  });

  it("rejects cross-origin forms before initializing auth", async () => {
    const { context, next } = request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://other.example" },
    });
    expect((await onRequest(context, next))?.status).toBe(403);
    expect(createAuth).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("lets signup and sign-in handlers initialize auth without a session cookie", async () => {
    for (const path of ["/api/auth/sign-up/email", "/api/auth/sign-in/email"]) {
      createAuth.mockClear();
      const { context } = request(path, {
        method: "POST",
        headers: { "content-type": "application/json", origin: runtime.env.AUTH_URL },
        body: JSON.stringify(account),
      });
      const response = await onRequest(context, async () => ALL(context));
      expect(response?.status).toBe(200);
      expect(response?.headers.getSetCookie().join(";")).toContain("session_token=");
      expect(createAuth).toHaveBeenCalledOnce();
      expect(context.locals.session).toBeNull();
    }
  });

  it("lets server-to-server OAuth token requests initialize auth in their handler", async () => {
    const { context } = request("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: "unknown", code: "invalid" }),
    });
    const response = await onRequest(context, async () => ALL(context));
    expect(response?.status).toBeGreaterThanOrEqual(400);
    expect(response?.status).toBeLessThan(500);
    expect(createAuth).toHaveBeenCalledOnce();
    expect(context.locals.session).toBeNull();
  });
});

describe("database outage responses", () => {
  it("keeps a valid session token out of Better Auth logs when session lookup stalls", async () => {
    const cookie = await signUp();
    const token = test.sqlite.prepare("SELECT token FROM session").get()!.token as string;
    vi.useFakeTimers();
    const logs = (["error", "warn", "info", "log", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const prototype = Object.getPrototypeOf(test.binding.prepare("SELECT 1"));
    const original = prototype.raw;
    const lookup = vi.spyOn(prototype, "raw").mockImplementation(function (this: { query: string }) {
      return /from "session"/i.test(this.query)
        ? new Promise(() => {})
        : original.call(this);
    });
    const { context, next } = request("/recipes", { headers: { cookie } });
    const pending = onRequest(context, next);
    await vi.waitFor(() => {
      expect(lookup.mock.contexts.some((value) => /from "session"/i.test((value as { query: string }).query))).toBe(true);
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    await vi.runAllTimersAsync();
    expect(response?.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
    const output = inspect(logs.flatMap((log) => log.mock.calls), { depth: null });
    expect(output).not.toContain(token);
    expect(output).not.toContain("Failed query:");
    expect(output).toContain("database_timeout");
  });

  it("bounds real auth initialization with a session cookie and never dispatches protected content", async () => {
    stallDatabase();
    const { context, next } = request("/recipes?private=value", {
      headers: { cookie: "better-auth.session_token=invalid", "cf-ray": "test-ray" },
    });
    const pending = onRequest(context, next);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("retry-after")).toBe("10");
    expect(await response?.text()).toContain(DATABASE_UNAVAILABLE_MESSAGE);
    expect(context.locals.session).toBeNull();
    expect(context.locals.user).toBeNull();
    expect(next).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(console.error).toHaveBeenCalledWith(expect.not.stringContaining("private=value"));
  });

  it.each(["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/get-session"])(
    "bounds independent auth initialization for %s and returns structured JSON",
    async (path) => {
      stallDatabase();
      const { context } = request(path, { method: path.endsWith("get-session") ? "GET" : "POST" });
      const pending = ALL(context);
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ code: "SERVICE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE });
    },
  );

  it("serializes an auth timeout before action dispatch as a real Astro ActionError", async () => {
    stallDatabase();
    const { context, next } = request("/_actions/recipes.create", {
      method: "POST", headers: { cookie: "better-auth.session_token=invalid", origin: runtime.env.AUTH_URL, "content-type": "application/json" },
    });
    const pending = onRequest(context, next);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    expect(response?.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
    const { deserializeActionResult } = await import("../node_modules/astro/dist/actions/runtime/client.js");
    const result = deserializeActionResult({ type: "error", status: 503, contentType: "application/json", body: await response!.text() });
    expect(result.error).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("shares auth's remaining deadline with page data and replaces Astro's swallowed page error", async () => {
    const cookie = await signUp();
    stallDatabase();
    const result = { user: { id: "cook" }, session: { userId: "cook" } };
    createAuth.mockReturnValue({
      api: { getSession: () => new Promise((resolve) => setTimeout(() => resolve(result), 3_000)) },
    } as unknown as ReturnType<typeof auth.createAuth>);
    const { context } = request("/recipes", { headers: { cookie } });
    const next = vi.fn(async () => {
      try {
        await createDb(runtime.env.DB).select().from(recipe).where(eq(recipe.userId, "private-page-owner"));
      } catch (error) {
        // Model the runtime replacing the original page exception with a 500.
        console.error(error instanceof Error ? error.stack : error);
        return new Response("Astro internal error", { status: 500 });
      }
      return new Response("Protected content");
    });
    const pending = onRequest(context, next);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(next).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await pending;
    expect(response?.status).toBe(503);
    expect(await response?.text()).toContain(DATABASE_UNAVAILABLE_MESSAGE);
    const output = inspect(vi.mocked(console.error).mock.calls, { depth: null });
    expect(output).not.toContain("private-page-owner");
    expect(output).not.toContain("Failed query:");
  });

  it("converts an action's swallowed write timeout and preserves uncertainty", async () => {
    stallDatabase();
    const { context } = request("/_actions/recipes.create", { method: "POST", headers: { origin: runtime.env.AUTH_URL, "content-type": "application/json" } });
    const later = vi.fn();
    const pending = onRequest(context, async () => {
      try {
        await createDb(runtime.env.DB).insert(recipe).values({ userId: "cook", title: "Soup" });
        later();
      } catch {
        return new Response('{"code":"INTERNAL_SERVER_ERROR"}', { status: 500 });
      }
      return new Response("saved");
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: DATABASE_WRITE_UNCERTAIN_MESSAGE });
    expect(response?.headers.has("retry-after")).toBe(false);
    expect(later).not.toHaveBeenCalled();
  });

  it("keeps long non-database action processing outside the database budget", async () => {
    vi.useFakeTimers();
    const { context } = request("/_actions/parse.parseFromUrl", { method: "POST", headers: { origin: runtime.env.AUTH_URL, "content-type": "application/json" } });
    const pending = onRequest(context, async () => {
      await getDatabaseBudget()!.run("initial.read", () => Promise.resolve(null));
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      await createDb(runtime.env.DB).select().from(recipe);
      return new Response("import parsed");
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await (await pending)?.text()).toBe("import parsed");
  });
});
