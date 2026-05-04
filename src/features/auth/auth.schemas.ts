import { z } from "zod";

/**
 * Caps on auth fields. Email max matches RFC 5321 (254). Password max
 * caps the work the password hasher has to do — without this an attacker
 * can submit megabytes of "password" and pin a CPU on every login attempt.
 * The lower bound (8) matches Better Auth's default.
 */
const MAX_EMAIL = 254;
const MAX_PASSWORD = 256;
const MAX_NAME = 100;

export const signInSchema = z.object({
  email: z.string().email("Invalid email").max(MAX_EMAIL),
  password: z.string().min(1, "Password is required").max(MAX_PASSWORD),
});

export const signUpSchema = z.object({
  email: z.string().email("Invalid email").max(MAX_EMAIL),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(MAX_PASSWORD),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(MAX_NAME),
});

export const resetPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .max(MAX_PASSWORD),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(MAX_PASSWORD),
    confirmNewPassword: z
      .string()
      .min(1, "Please confirm your new password")
      .max(MAX_PASSWORD),
  })
  .refine((data) => data.confirmNewPassword === data.newPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmNewPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
