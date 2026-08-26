import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";

interface Props {
  hasPassword: boolean;
  hasGoogle: boolean;
}

export function ConnectedAccounts({ hasPassword, hasGoogle }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectGoogle() {
    setPending(true);
    setError(null);

    let err: { message?: string } | null = null;
    try {
      ({ error: err } = await authClient.linkSocial({
        provider: "google",
        callbackURL: `${window.location.origin}/profile`,
        errorCallbackURL: `${window.location.origin}/profile?auth_error=google_link_failed`,
      }));
    } catch {
      setError("Unable to reach the sign-in service. Please try again.");
      setPending(false);
      return;
    }

    if (err) {
      setError(err.message || "Could not connect Google");
      setPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-card-foreground">Sign-in methods</h2>
        <p className="text-sm text-muted-foreground">
          Connect Google after signing in with your existing password account.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-input border border-border px-3 py-2">
          <span>Email and password</span>
          <span className="text-xs text-muted-foreground">{hasPassword ? "Connected" : "Not connected"}</span>
        </div>
        <div className="flex items-center justify-between rounded-input border border-border px-3 py-2">
          <span>Google</span>
          <span className="text-xs text-muted-foreground">{hasGoogle ? "Connected" : "Not connected"}</span>
        </div>
      </div>

      {!hasGoogle && (
        <Button type="button" variant="outline" className="w-full" onClick={connectGoogle} disabled={pending}>
          {pending ? "Connecting Google…" : "Connect Google"}
        </Button>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
