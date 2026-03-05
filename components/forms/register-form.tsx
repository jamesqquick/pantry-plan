"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              error={!!(state && !state.ok && state.error?.fieldErrors?.email)}
            />
            {state && !state.ok && state.error?.fieldErrors?.email && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.email[0]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              error={!!(state && !state.ok && state.error?.fieldErrors?.password)}
            />
            {state && !state.ok && state.error?.fieldErrors?.password && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {state.error.fieldErrors.password[0]}
              </p>
            )}
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <Button type="submit" className="w-full">
            Create account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <a href="/login" className="underline hover:no-underline">
              Already have an account? Sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
