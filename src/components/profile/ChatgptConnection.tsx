import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CHATGPT_CLIENT_ID, OAUTH_SCOPE_LABELS } from "@/lib/oauth-config";

type Connection = { scopes: string[]; connectedAt: string } | null;

export function ChatgptConnection({ initialConnection }: { initialConnection: Connection }) {
  const [connection, setConnection] = useState(initialConnection);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  async function disconnect() {
    setPending(true);
    setError(null);
    try {
      const { error } = await actions.chatgpt.disconnect({});
      if (error) setError("Could not disconnect ChatGPT. Please try again.");
      else { setConnection(null); setDisconnected(true); }
    } catch {
      setError("Unable to reach Quick Pantry. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="chatgpt-heading" className="space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 id="chatgpt-heading" className="text-lg font-semibold text-card-foreground">ChatGPT connection</h2>
      {connection ? <>
        <p className="text-body">Connected since <time dateTime={connection.connectedAt}>{connection.connectedAt.slice(0, 10)}</time>.</p>
        <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">{connection.scopes.map((scope) => <li key={scope}>{OAUTH_SCOPE_LABELS[scope] ?? scope}</li>)}</ul>
        <p className="text-body text-muted-foreground">Disconnecting stops new tool requests and token refreshes. It does not remove information already returned to ChatGPT.</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={disconnect} disabled={pending}>{pending ? "Disconnecting…" : "Disconnect ChatGPT"}</Button>
      </> : <p className="text-body text-muted-foreground">No active connection. Start a connection from the Quick Pantry plugin in ChatGPT and sign in with this account.</p>}
      {disconnected && <p role="status" className="text-body">ChatGPT disconnected. To reconnect, start a new connection in ChatGPT.</p>}
      {error && <p role="alert" className="text-body text-destructive">{error}</p>}
    </section>
  );
}

export function ChatgptSetup({ initialRedirectUri }: { initialRedirectUri: string }) {
  const [redirectUri, setRedirectUri] = useState(initialRedirectUri);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function configure(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await actions.chatgpt.configure({ redirectUri });
      if (error) setError(error.message || "Could not save the OAuth client. Please try again.");
      else setMessage("ChatGPT OAuth client saved. Test the connection in ChatGPT before submitting the plugin.");
    } catch {
      setError("Unable to reach Quick Pantry. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="chatgpt-setup-heading" className="space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 id="chatgpt-setup-heading" className="text-lg font-semibold text-card-foreground">ChatGPT publisher setup</h2>
      <p className="text-body text-muted-foreground">Admin only. Register the exact redirect URI shown in ChatGPT's MCP server settings for the public client <code className="break-all">{CHATGPT_CLIENT_ID}</code>. Changing this URI replaces the allowlist for new authorizations.</p>
      <form onSubmit={configure} className="space-y-3">
        <label htmlFor="chatgpt-redirect-uri" className="block text-sm font-medium">ChatGPT redirect URI</label>
        <Input id="chatgpt-redirect-uri" name="redirectUri" type="url" required value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} aria-invalid={!!error} />
        <Button type="submit" className="min-h-11" disabled={pending}>{pending ? "Saving…" : "Save OAuth client"}</Button>
      </form>
      {message && <p role="status" className="text-body">{message}</p>}
      {error && <p role="alert" className="text-body text-destructive">{error}</p>}
    </section>
  );
}
