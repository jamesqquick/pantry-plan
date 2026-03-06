"use server";

import type { ActionResult } from "@/lib/action-helpers";
import { requireUser } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/client";

export type AuthenticatedUser = { id: string; email: string; role: UserRole };

/** Shared helper: get current user or return UNAUTHORIZED ActionResult. */
export async function getAuthenticatedUser(): Promise<ActionResult<AuthenticatedUser>> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "You must be signed in." } };
  }
  return { ok: true, data: { id: user.id, email: user.email, role: user.role } };
}

/** Require admin role; use only when mutating global ingredients. Returns user or FORBIDDEN. */
export async function requireAdmin(): Promise<ActionResult<AuthenticatedUser>> {
  const result = await getAuthenticatedUser();
  if (!result.ok) return result;
  if (result.data.role !== "ADMIN") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Admin role required." } };
  }
  return result;
}
