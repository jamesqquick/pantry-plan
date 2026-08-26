import { ActionError, defineAction } from "astro:actions";
import { eq, and } from "drizzle-orm";
import {
  updateProfileSchema,
  resetPasswordSchema,
} from "@/features/auth/auth.schemas";
import { user, account } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { getDb, requireUser } from "./_shared";

export const profile = {
  /**
   * Update the current user's display name.
   * The middleware already guarantees a valid session; we just need the
   * user ID to scope the update.
   */
  updateName: defineAction({
    input: updateProfileSchema,
    handler: async (input, ctx) => {
      const authedUser = requireUser(ctx);
      const db = getDb();
      const name = input.name.trim();

      await db
        .update(user)
        .set({ name, updatedAt: new Date() })
        .where(eq(user.id, authedUser.id));

      return { name };
    },
  }),

  /**
   * Change password for an authenticated user.
   *
   * Flow:
   *  1. Validate the three password fields (current, new, confirm) with Zod.
   *  2. Look up the credential account row for this user.
   *  3. Verify the current password against the stored scrypt hash.
   *  4. Hash the new password and update the account row.
   *
   * Note: The Zod schema's `.refine()` that checks newPassword === confirmNewPassword
   * fires on the client before hitting this handler when using `accept: "json"`.
   * With `accept: "form"`, Astro validates the flat fields but the refine still
   * runs server-side.
   */
  changePassword: defineAction({
    input: resetPasswordSchema,
    handler: async (input, ctx) => {
      const authedUser = requireUser(ctx);
      const db = getDb();

      // Find the credential account for this user
      const [credentialAccount] = await db
        .select({ id: account.id, password: account.password })
        .from(account)
        .where(
          and(
            eq(account.userId, authedUser.id),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);

      if (!credentialAccount?.password) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "This account does not have a password sign-in method.",
        });
      }

      // Verify the current password
      const currentValid = await verifyPassword({
        password: input.currentPassword,
        hash: credentialAccount.password,
      });

      if (!currentValid) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect.",
        });
      }

      // Hash and store the new password
      const newHash = await hashPassword(input.newPassword);

      await db
        .update(account)
        .set({ password: newHash, updatedAt: new Date() })
        .where(eq(account.id, credentialAccount.id));

      return { ok: true };
    },
  }),
};
