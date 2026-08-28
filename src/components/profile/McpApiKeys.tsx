import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type Props = {
  endpoint: string;
  initialKeys: ApiKeySummary[];
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function McpApiKeys({ endpoint, initialKeys }: Props) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeySummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setPending(true);
    setError(null);
    setCopied(false);
    const { data, error: actionError } = await actions.mcpKeys.create({
      name: trimmedName,
    });
    setPending(false);

    if (actionError) {
      setError(actionError.message || "Could not create MCP key.");
      return;
    }

    setKeys((current) => [
      {
        id: data.id,
        name: data.name,
        keyPrefix: data.keyPrefix,
        createdAt: new Date(data.createdAt).toISOString(),
        lastUsedAt: null,
      },
      ...current,
    ]);
    setNewToken(data.token);
    setName("");
  }

  async function handleCopy() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
  }

  async function handleRevoke() {
    if (!keyToRevoke) return;
    const key = keyToRevoke;
    setRevokingId(key.id);
    setError(null);
    const { error: actionError } = await actions.mcpKeys.revoke({ id: key.id });
    if (actionError) {
      setError(actionError.message || "Could not revoke MCP key.");
      setRevokingId(null);
      return;
    }
    setKeys((current) => current.filter((item) => item.id !== key.id));
    setRevokingId(null);
    setKeyToRevoke(null);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-card-foreground">MCP access</h2>
        <p className="text-sm text-muted-foreground">
          Create a key for each AI client that should be able to add recipes to
          your account.
        </p>
      </div>

      <div className="rounded-input border border-border bg-muted/40 p-3 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          MCP endpoint
        </p>
        <code className="block break-all text-sm text-foreground">{endpoint}</code>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Claude Desktop, Cursor, etc."
          aria-label="MCP key name"
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" disabled={pending || !name.trim()} className="shrink-0">
          {pending ? "Creating..." : "Create key"}
        </Button>
      </form>

      {newToken && (
        <div className="rounded-input border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Copy your new key now</p>
            <p className="text-xs text-muted-foreground">
              Pantry Plan cannot show this secret again.
            </p>
          </div>
          <code className="block break-all rounded-input bg-background p-3 text-xs text-foreground">
            {newToken}
          </code>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy key"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setNewToken(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {error && !keyToRevoke && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Active keys</h3>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No MCP keys yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-input border border-border">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{key.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {key.keyPrefix}...
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatDate(key.createdAt)} · Last used {formatDate(key.lastUsedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="sm"
                  disabled={revokingId === key.id}
                  onClick={() => {
                    setError(null);
                    setKeyToRevoke(key);
                  }}
                  className="justify-center"
                >
                  {revokingId === key.id ? "Revoking..." : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={keyToRevoke !== null}
        onOpenChange={(open) => {
          if (!open && revokingId === null) setKeyToRevoke(null);
        }}
        title="Revoke MCP key?"
        description={
          keyToRevoke
            ? `The key "${keyToRevoke.name}" will stop working immediately. This cannot be undone.`
            : "This key will stop working immediately. This cannot be undone."
        }
        confirmLabel="Yes, revoke"
        pendingLabel="Revoking..."
        pending={revokingId !== null}
        error={error}
        onConfirm={handleRevoke}
      />
    </section>
  );
}
