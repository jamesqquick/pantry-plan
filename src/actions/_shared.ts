/**
 * Shared helpers for every Astro action in this project.
 *
 * Each action authenticates via requireUser/requireAdmin, validates with Zod,
 * mutates via Drizzle, and throws ActionError on failure (surfaced as
 * `{ error }` on the client call site).
 */
import { env } from "cloudflare:workers";
import { ActionError, type ActionAPIContext } from "astro:actions";
import { createDb, type Db } from "@/db";
import type { User } from "better-auth";

/** Base User shape plus our custom `role` field set via Better Auth additionalFields. */
export type AuthenticatedUser = User & { role: "USER" | "ADMIN" };

/**
 * Retrieve the authenticated user from context, or throw ActionError
 * (which Astro surfaces as `{ error }` on the client call site).
 *
 * Usage inside an action handler:
 *   const user = requireUser(ctx);
 *   const db = getDb();
 */
export function requireUser(ctx: ActionAPIContext): AuthenticatedUser {
  const user = ctx.locals.user;
  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in.",
    });
  }
  return user as AuthenticatedUser;
}

/** Same as requireUser, but also enforces ADMIN role. */
export function requireAdmin(ctx: ActionAPIContext): AuthenticatedUser {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN") {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Admin role required.",
    });
  }
  return user;
}

/**
 * Build a Drizzle client. D1 binding lives on env per-request, so we create
 * one per action invocation. Cheap (just a wrapper object).
 */
export function getDb(): Db {
  return createDb(env.DB);
}

/** Wrap a unique-like constraint violation into a clean ActionError. */
export function throwDuplicate(message: string): never {
  throw new ActionError({ code: "CONFLICT", message });
}

/** Shared error for ownership / not-found. Same shape so UI code can branch. */
export function throwNotFound(message = "Not found."): never {
  throw new ActionError({ code: "NOT_FOUND", message });
}
