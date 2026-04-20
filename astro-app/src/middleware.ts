import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";

/**
 * Public routes — everything else under `/app/*` paths that aren't the
 * landing page is treated as protected. API routes for auth are always public.
 */
const PUBLIC_PATH_PREFIXES = [
  "/api/auth/",
  "/_image",
  "/_astro/",
  "/favicon",
];

const AUTH_ONLY_PATHS = new Set<string>(["/login", "/register"]);

const ALWAYS_PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/register",
]);

function isPublicPath(pathname: string): boolean {
  if (ALWAYS_PUBLIC_PATHS.has(pathname)) return true;
  // Static 404 page served by Cloudflare (with or without trailing slash).
  if (pathname === "/404" || pathname === "/404/") return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const auth = createAuth(env);
  const result = await auth.api.getSession({
    headers: context.request.headers,
  });

  // Better Auth's base User type doesn't include `role` (it's an additionalField),
  // but the adapter returns it at runtime. Cast via unknown for the type narrowing.
  context.locals.user = (result?.user ?? null) as App.Locals["user"];
  context.locals.session = result?.session ?? null;

  const { pathname } = context.url;
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
