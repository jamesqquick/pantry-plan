/// <reference types="astro/client" />

// Cloudflare bindings will be typed here via `wrangler types` once
// bindings are added to wrangler.jsonc. For now we declare the shape
// of App.Locals and App.SessionData.

declare namespace App {
  interface Locals {
    // Populated by middleware in Phase 2 (auth)
    user: import("@/lib/auth-types").User | null;
    session: import("@/lib/auth-types").Session | null;
  }

  interface SessionData {
    // Session fields declared here become typed on Astro.session / context.session
    userId?: string;
  }
}
