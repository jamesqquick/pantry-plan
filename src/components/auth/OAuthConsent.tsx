import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { OAUTH_SCOPE_LABELS } from "@/lib/oauth-config";
import { Button } from "@/components/ui/Button";

export function OAuthConsent({ oauthQuery, scopes, email }: { oauthQuery: string; scopes: string[]; email: string }) {
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    try {
      const { data, error } = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery });
      if (error || !data?.url) {
        setError("Could not complete the connection. Try again or restart it from ChatGPT.");
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Unable to reach Quick Pantry. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="break-words text-body">Connecting as <strong>{email}</strong>.</p>
      <div className="space-y-2">
        <h2 className="text-body font-semibold">ChatGPT is requesting permission to:</h2>
        <ul className="list-disc space-y-2 pl-5 text-body">
          {scopes.map((scope) => <li key={scope}>{OAUTH_SCOPE_LABELS[scope]}</li>)}
        </ul>
      </div>
      <p className="text-body text-muted-foreground">ChatGPT will receive the recipe and meal-plan data returned by the tools you use. You can disconnect at any time in your Quick Pantry Profile.</p>
      <p className="text-body"><a className="text-primary-on-card underline" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>{" · "}<a className="text-primary-on-card underline" href="/terms" target="_blank" rel="noopener noreferrer">Terms of service</a></p>
      {error && <p role="alert" className="text-body text-destructive">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button className="min-h-11 w-full" type="button" disabled={pending !== null} onClick={() => decide(true)}>{pending === "allow" ? "Connecting…" : "Allow connection"}</Button>
        <Button className="min-h-11 w-full" type="button" variant="outline" disabled={pending !== null} onClick={() => decide(false)}>{pending === "deny" ? "Declining…" : "Decline"}</Button>
      </div>
    </div>
  );
}
