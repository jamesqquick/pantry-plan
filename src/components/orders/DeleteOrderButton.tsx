import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteOrderButtonProps {
  orderId: string;
  orderName: string;
}

export function DeleteOrderButton({ orderId, orderName }: DeleteOrderButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", orderId);
    const { error: err } = await actions.orders.delete(fd);
    if (err) {
      setError(err.message);
      setDeleting(false);
    } else {
      window.location.href = "/orders";
    }
  }

  return (
    <>
      <Button variant="ghost-danger" size="sm" onClick={() => setDialogOpen(true)}>
        {/* Lucide Trash2 */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-1.5 h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
        Delete order
      </Button>
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && !deleting) setError(null);
        }}
        title="Delete order?"
        description={`Are you sure you want to delete ${orderName || "this order"}? This cannot be undone.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        pending={deleting}
        error={error}
        onConfirm={handleDelete}
      />
    </>
  );
}
