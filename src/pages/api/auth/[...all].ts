import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";

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
    const clientIp = ctx.request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.PASSWORD_RESET_RATE_LIMIT.limit({
      key: `password-reset:${clientIp}`,
    });

    if (!success) {
      return new Response(
        JSON.stringify({
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Too many password reset requests. Please try again later.",
          },
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" },
        },
      );
    }
  }

  const waitUntil = ctx.locals.cfContext?.waitUntil.bind(ctx.locals.cfContext);
  const auth = createAuth(env, waitUntil);
  return auth.handler(ctx.request);
};
