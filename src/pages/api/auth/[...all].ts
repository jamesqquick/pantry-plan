import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";
import { getRequestIp, isRateLimited } from "@/lib/rate-limit-utils";
import { DatabaseBudget, getDatabaseBudget, withDatabaseBudget } from "@/lib/database-timeout";
import { databaseUnavailableResponse } from "@/lib/database-unavailable";

// Must be on-demand rendered so `env` is available per-request.
export const prerender = false;

/**
 * Catch-all handler for Better Auth endpoints:
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/get-session
 *   ...and all other Better Auth routes.
 */
export const ALL: APIRoute = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (url.pathname === "/api/auth/request-password-reset" && ctx.request.method === "POST") {
    const rateLimit = env.PASSWORD_RESET_RATE_LIMIT;
    const clone = ctx.request.clone();
    const reader = clone.body?.getReader();

    if (rateLimit && reader) {
      let bodyText = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bodyText += decoder.decode(value, { stream: true });
        if (bodyText.length > 16_384) break;
      }
      bodyText += decoder.decode();

      let body: unknown;
      try {
        body = JSON.parse(bodyText) as unknown;
      } catch {
        body = undefined;
      }

      const email =
        typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : undefined;

      if (email) {
        const limited =
          await isRateLimited(rateLimit, `password-reset:ip:${getRequestIp(ctx.request)}`) ||
          await isRateLimited(rateLimit, `password-reset:email:${email}`);

        if (limited) {
          return new Response(
            JSON.stringify({
              status: true,
              message: "If this email exists, check your email for the reset link.",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
      }
    }
  }

  const waitUntil = ctx.locals.cfContext?.waitUntil.bind(ctx.locals.cfContext);
  const budget = getDatabaseBudget() ?? new DatabaseBudget({
    route: ctx.routePattern ?? url.pathname,
    requestId: ctx.request.headers.get("cf-ray") ?? undefined,
  });
  return withDatabaseBudget(budget, async () => {
    try {
      const auth = await budget.run("auth.initialize", async () => {
        const auth = createAuth(env, waitUntil);
        await auth.$context;
        return auth;
      });
      // D1 execution steps are guarded individually so timeout stops subsequent writes.
      const response = await auth.handler(ctx.request);
      return budget.error ? databaseUnavailableResponse(ctx, budget) : response;
    } catch (error) {
      if (budget.error) return databaseUnavailableResponse(ctx, budget);
      throw error;
    }
  });
};
