import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  cancelCreate, confirmCreate, createdResourcePath, PENDING_CREATES_CHANGED,
  readPendingCreates, retryCreate, type PendingCreate,
} from "@/features/mutations/client";
import { softNavigate } from "@/lib/navigate";

export function PendingCreates() {
  const [entries, setEntries] = useState<PendingCreate[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      try { setEntries(readPendingCreates()); } catch { setEntries([]); }
    }
    refresh();
    window.addEventListener(PENDING_CREATES_CHANGED, refresh);
    return () => window.removeEventListener(PENDING_CREATES_CHANGED, refresh);
  }, []);

  async function recover(entry: PendingCreate, mode: "confirm" | "retry" | "cancel") {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await (mode === "cancel" ? cancelCreate(entry) : mode === "retry" ? retryCreate(entry) : confirmCreate(entry));
      if (result.data) {
        softNavigate(createdResourcePath(entry, result.data.id));
      } else {
        setMessage(result.error?.message ?? "This save is not confirmed yet. It may still finish. Check again, or safely retry the original submission with the same tracking key.");
      }
    } catch {
      setMessage("Could not check this save. Your original submission is still remembered; try again when your connection returns.");
    } finally {
      setPending(false);
    }
  }

  if (entries.length === 0 && !message && !pending) return null;
  return (
    <section aria-label="Unconfirmed saves" aria-busy={pending} className="mb-6 space-y-3 rounded-input border border-border bg-muted p-4">
      <p className="font-medium">{entries.length > 0 ? "A previous save has an unknown outcome." : "Save status"}</p>
      {entries.length > 0 && <p className="text-body text-muted-foreground">Check whether it finished before creating another. Retrying sends the original fields. Cancelling opens the saved result if it already finished; otherwise it prevents this submission from saving later.</p>}
      {entries.map((entry) => (
        <div key={entry.operationId} className="flex flex-wrap items-center gap-3">
          <span className="text-body">{entry.kind === "orders.create" ? "Order" : "Recipe"}: {String(entry.payload.title ?? entry.payload.name ?? (entry.payload.recipe as { title?: string } | undefined)?.title ?? "Recipe copy")}</span>
          <Button variant="secondary" disabled={pending} onClick={() => recover(entry, "confirm")}>Check save status</Button>
          <Button variant="secondary" disabled={pending} onClick={() => recover(entry, "retry")}>Retry original save</Button>
          <Button variant="secondary" disabled={pending} onClick={() => recover(entry, "cancel")}>Cancel original save</Button>
        </div>
      ))}
      {pending && <p role="status" className="text-body">Checking the original save…</p>}
      {message && <p role="status" className="text-body">{message}</p>}
    </section>
  );
}
