import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";
import { getRequestIp, isRateLimited } from "@/lib/rate-limit-utils";

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
  if (ctx.url.pathname === "/api/auth/request-password-reset" && ctx.request.method === "POST") {
    const genericResponse = (status = 200) => new Response(
      JSON.stringify({ status: true, message: "If this email exists in our system, check your email for the reset link" }),
      { status, headers: { "content-type": "application/json" } },
    );
    const rateLimit = env.PASSWORD_RESET_RATE_LIMIT;
    const contentLengthHeader = ctx.request.headers.get("content-length");
    const contentLength = Number(contentLengthHeader);
    if (!rateLimit) return genericResponse(503);
    if (!contentLengthHeader || !Number.isSafeInteger(contentLength) || contentLength > 16_384) {
      return genericResponse();
    }

    const body: unknown = await ctx.request.clone().json().catch(() => null);
    const email = typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
      ? body.email
      : undefined;

    if (typeof email === "string") {
      const key = email.trim().toLowerCase();
      const limited = await isRateLimited(rateLimit, `password-reset:ip:${getRequestIp(ctx.request)}`)
        || await isRateLimited(rateLimit, `password-reset:email:${key}`);
      if (limited) return genericResponse();
    }
  }

  const auth = createAuth(env);
  return auth.handler(ctx.request);
};
