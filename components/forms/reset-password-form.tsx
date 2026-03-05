"use client";

import { useActionState, useEffect, useState } from "react";
import { resetPasswordAction } from "@/app/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      setToast({ message: "Password changed successfully", variant: "success" });
    } else {
      setToast({ message: state.error.message, variant: "error" });
    }
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Current password
            </label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              error={!!(state && !state.ok && state.error?.fieldErrors?.currentPassword)}
            />
            {state && !state.ok && state.error?.fieldErrors?.currentPassword && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.currentPassword[0]}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="newPassword"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              New password
            </label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              error={!!(state && !state.ok && state.error?.fieldErrors?.newPassword)}
            />
            {state && !state.ok && state.error?.fieldErrors?.newPassword && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.newPassword[0]}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="confirmNewPassword"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Confirm new password
            </label>
            <Input
              id="confirmNewPassword"
              name="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              required
              error={!!(state && !state.ok && state.error?.fieldErrors?.confirmNewPassword)}
            />
            {state && !state.ok && state.error?.fieldErrors?.confirmNewPassword && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.confirmNewPassword[0]}
              </p>
            )}
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <div>
            <Button type="submit">Change password</Button>
          </div>
        </form>
      </CardContent>
    </Card>
    {toast && <Toast message={toast.message} variant={toast.variant} />}
    </>
  );
}
