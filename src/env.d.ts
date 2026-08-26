/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

/**
 * Cloudflare env additions that wrangler types doesn't pick up automatically:
 * secrets set via `wrangler secret put` and locally via .dev.vars.
 */
declare namespace Cloudflare {
  interface Env {
    AUTH_SECRET: string;
    AUTH_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    AI: Ai;

  }
}

/**
 * App-specific user shape — Better Auth's base User plus our `role` additional field.
 */
type AppUser = import("better-auth").User & {
  role: "USER" | "ADMIN";
};

declare namespace App {
  interface Locals {
    // Populated by middleware via better-auth (src/middleware.ts)
    user: AppUser | null;
    session: import("better-auth").Session | null;
  }

  interface SessionData {
    // Astro sessions (KV-backed) — reserved for future use
    userId?: string;
  }
}
