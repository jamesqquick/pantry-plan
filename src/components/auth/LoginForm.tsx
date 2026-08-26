import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { safeRelativePath } from "@/lib/navigate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getGoogleAuthErrorMessage } from "@/lib/auth-errors";

interface Props {
  /** Optional post-login redirect target. */
  next?: string;
}

export function LoginForm({ next }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const oauthError = typeof window !== "undefined"
    ? (() => {
        const params = new URLSearchParams(window.location.search);
        return params.get("auth_error") ?? params.get("error");
      })()
    : null;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    let err: { message?: string } | null = null;
    try {
      ({ error: err } = await signIn.email({ email, password }));
    } catch {
      setError("Unable to reach the sign-in service. Please try again.");
      setPending(false);
      return;
    }

    if (err) {
      setError(err.message || "Invalid email or password");
      setPending(false);
      return;
    }

    // Full navigation so middleware re-runs against the new cookie.
    // Validate `next` against open-redirect tricks (e.g. //evil.com).
    window.location.href = safeRelativePath(next, "/recipes");
  };

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {oauthError && !error && (
        <p role="alert" className="text-sm text-destructive">
          {getGoogleAuthErrorMessage(oauthError)}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="relative flex items-center py-1" aria-hidden="true">
        <div className="grow border-t border-border" />
        <span className="px-3 text-xs text-muted-foreground">OR</span>
        <div className="grow border-t border-border" />
      </div>

      <GoogleSignInButton next={next} />

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a href="/register" className="font-medium text-primary-on-card hover:underline">
          Create one
        </a>
      </p>
    </form>
  );
}
