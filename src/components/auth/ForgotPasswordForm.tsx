import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { error: requestError } = await requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) throw new Error(requestError.message);
      setSubmitted(true);
    } catch {
      setError("Unable to send the reset email. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4">
        <p className="text-sm">If an account uses that email, we sent a password reset link.</p>
        <p className="text-sm text-muted-foreground">Check your inbox and spam folder. The link expires in one hour.</p>
        <a href="/login" className="block text-center text-sm font-medium text-primary-on-card hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={!!error} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Sending link…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm">
        <a href="/login" className="font-medium text-primary-on-card hover:underline">Back to sign in</a>
      </p>
    </form>
  );
}
