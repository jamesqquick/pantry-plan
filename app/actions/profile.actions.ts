"use server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { updateProfileSchema, resetPasswordSchema } from "@/features/auth/auth.schemas";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";

export async function updateProfileAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const { id } = userResult.data;

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }
  const { name } = parsed.data;

  const db = getDb();
  await db.user.update({
    where: { id },
    data: { name },
  });

  const updated = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  });
  if (!updated) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to refresh session." } };
  }

  await setSessionCookie({
    sub: updated.id,
    email: updated.email,
    name: updated.name,
  });

  return { ok: true, data: undefined };
}

export async function resetPasswordAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const { id } = userResult.data;

  const db = getDb();
  const dbUser = await db.user.findUnique({
    where: { id },
    select: { passwordHash: true },
  });
  if (!dbUser) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "User not found." } };
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }
  const { currentPassword, newPassword } = parsed.data;

  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Current password is incorrect.",
        fieldErrors: { currentPassword: ["Current password is incorrect."] },
      },
    };
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id },
    data: { passwordHash },
  });

  return { ok: true, data: undefined };
}
