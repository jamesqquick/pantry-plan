import { useEffect, useState } from "react";
import { resetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props { token: string; }

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, "", "/reset-password");
  }, []);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const { error: resetError } = await resetPassword({ newPassword: password, token });
      if (resetError) {
        setError(resetError.message || "This reset link is invalid or expired.");
        return;
      }
      window.location.href = "/login?password_reset=success";
    } catch {
      setError("Unable to reset your password. Please request a new link.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">New password</label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={!!error} />
        <p className="text-xs text-muted-foreground">8 characters or more.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="confirmation" className="block text-sm font-medium">Confirm new password</label>
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-invalid={!!error} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Resetting password…" : "Reset password"}
      </Button>
    </form>
  );
}
