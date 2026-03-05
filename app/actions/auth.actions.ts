"use server";

import { redirect } from "next/navigation";
import { hashPassword } from "@/lib/password";
import { signOut } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { signUpSchema } from "@/features/auth/auth.schemas";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";

export async function registerAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = signUpSchema.safeParse(raw);
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
  const { email, password } = parsed.data;
  const db = getDb();
  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "An account with this email already exists",
        fieldErrors: { email: ["An account with this email already exists"] },
      },
    };
  }
  const passwordHash = await hashPassword(password);
  await db.user.create({
    data: { email: email.toLowerCase(), passwordHash },
  });
  redirect("/login?registered=1");
}

export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}
