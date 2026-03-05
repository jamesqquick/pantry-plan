"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toast } from "@/components/ui/toast";

interface ProfileFormProps {
  initialName: string;
  email: string;
}

export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateProfileAction, null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setToast({ message: "Profile updated", variant: "success" });
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Profile details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="email-display"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <Input
              id="email-display"
              type="text"
              value={email}
              readOnly
              disabled
              className="bg-muted"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Email cannot be changed.
            </p>
          </div>
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Name
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              defaultValue={initialName}
              autoComplete="name"
              error={!!(state && !state.ok && state.error?.fieldErrors?.name)}
            />
            {state && !state.ok && state.error?.fieldErrors?.name && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.name[0]}
              </p>
            )}
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </>
  );
}
