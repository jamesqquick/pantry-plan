import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);

    try {
      await requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Keep the response neutral even when the auth service is unavailable.
    } finally {
      // Keep this response neutral so the form cannot be used to enumerate users.
      setSubmitted(true);
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm text-muted-foreground">
          If an account exists for that email, you&apos;ll receive a password reset link shortly.
        </p>
        <a href="/login" className="block text-center text-sm font-medium text-primary-on-card hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Sending link…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <a href="/login" className="font-medium text-primary-on-card hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
