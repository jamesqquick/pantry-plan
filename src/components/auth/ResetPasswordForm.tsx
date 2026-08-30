import { useState } from "react";
import { resetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const { error: resetError } = await resetPassword({
        newPassword: password,
        token,
      });

      if (resetError) {
        setError("This reset link is invalid or expired.");
        return;
      }

      setComplete(true);
    } catch {
      setError("Unable to reset your password. Please request a new link.");
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          This password reset link is missing or invalid.
        </p>
        <a href="/forgot-password" className="block text-center text-sm font-medium text-primary-on-card hover:underline">
          Request a new link
        </a>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm text-muted-foreground">
          Your password has been updated. You can sign in with your new password.
        </p>
        <a href="/login" className="block text-center text-sm font-medium text-primary-on-card hover:underline">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          New password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmation" className="block text-sm font-medium">
          Confirm new password
        </label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={256}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
