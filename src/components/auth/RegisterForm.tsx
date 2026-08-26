import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    let err: { message?: string } | null = null;
    try {
      ({ error: err } = await signUp.email({ name, email, password }));
    } catch {
      setError("Unable to reach the sign-up service. Please try again.");
      setPending(false);
      return;
    }

    if (err) {
      setError(err.message || "Could not create account");
      setPending(false);
      return;
    }

    // autoSignIn is on, so the cookie is already set. Full nav reloads middleware.
    window.location.href = "/recipes";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
        />
      </div>

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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
        />
        <p className="text-xs text-muted-foreground">
          8 characters or more.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full py-2.5">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <div className="relative flex items-center py-1" aria-hidden="true">
        <div className="grow border-t border-border" />
        <span className="px-3 text-xs text-muted-foreground">OR</span>
        <div className="grow border-t border-border" />
      </div>

      <GoogleSignInButton label="Sign up with Google" />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-primary-on-card hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
