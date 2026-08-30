import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";

/**
 * Public routes — anything else requires auth.
 *
 * Note: Cloudflare's static-asset serving runs before the Worker (see
 * wrangler.jsonc), so requests for `/_astro/*`, `/favicon*`, and any
 * other prerendered asset never reach this middleware. We only need to
 * special-case dynamic public routes here.
 */
const PUBLIC_PATH_PREFIXES = [
  "/api/auth/",
  // Astro actions have their own auth checks via requireUser() — let them run
  // so XHR callers get a proper 401 JSON payload instead of a useless 302
  // to /login.
  "/_actions/",
];

const AUTH_ONLY_PATHS = new Set<string>(["/login", "/register"]);

const ALWAYS_PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/404",
]);

function isPublicPath(pathname: string): boolean {
  if (ALWAYS_PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  // MCP requests authenticate with a profile-generated bearer key in the
  // endpoint itself, not with a browser session.
  if (pathname === "/mcp") return next();

  const waitUntil = context.locals.cfContext?.waitUntil.bind(context.locals.cfContext);
  const auth = createAuth(env, waitUntil);
  const result = await auth.api.getSession({
    headers: context.request.headers,
  });

  // Better Auth's base User type doesn't include `role` (it's an additionalField),
  // but the adapter returns it at runtime. Cast via unknown for the type narrowing.
  context.locals.user = (result?.user ?? null) as App.Locals["user"];
  context.locals.session = result?.session ?? null;

  const isAuthed = !!context.locals.session;

  // Already signed in? Don't show login/register — bounce to recipes.
  if (isAuthed && AUTH_ONLY_PATHS.has(pathname)) {
    return context.redirect("/recipes");
  }

  // Protected area: anything not in the public list requires auth.
  if (!isAuthed && !isPublicPath(pathname)) {
    const next = pathname + context.url.search;
    return context.redirect(
      `/login?next=${encodeURIComponent(next)}`
    );
  }

  return next();
});
