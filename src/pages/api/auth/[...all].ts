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
export const ALL: APIRoute = (ctx) => {
  const auth = createAuth(env);
  return auth.handler(ctx.request);
};
