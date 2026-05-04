import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";

interface DeleteIngredientButtonProps {
  ingredientId: string;
  ingredientName: string;
}

export function DeleteIngredientButton({
  ingredientId,
  ingredientName,
}: DeleteIngredientButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const formData = new FormData();
    formData.set("id", ingredientId);
    const { error: err } = await actions.ingredients.delete(formData);
    if (err) {
      setError(err.message);
      setDeleting(false);
      setConfirming(false);
    } else {
      window.location.href = "/ingredients";
    }
  }

  if (!confirming) {
    return (
      <div>
        <Button
          variant="ghost-danger"
          size="sm"
          onClick={() => setConfirming(true)}
        >
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
          Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <p className="text-sm text-destructive">
        Are you sure you want to delete <strong>{ingredientName}</strong>? This cannot be undone.
      </p>
      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={deleting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
