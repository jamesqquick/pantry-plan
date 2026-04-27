import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const resetPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.confirmNewPassword === data.newPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmNewPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
