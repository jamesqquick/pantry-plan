import { useState } from "react";
import { actions } from "astro:actions";

export interface RecipeActionsProps {
  recipeId: string;
}

/**
 * Detail-page action cluster: edit link + duplicate + delete.
 * Duplicate and delete both go to the recipes.* actions we shipped in Phase 5.
 */
export default function RecipeActions({ recipeId }: RecipeActionsProps) {
  const [pending, setPending] = useState<"duplicate" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate() {
    setPending("duplicate");
    setError(null);
    const form = new FormData();
    form.append("recipeId", recipeId);
    const { data, error: err } = await actions.recipes.duplicate(form);
    if (err) {
      setError(err.message || "Could not duplicate recipe");
      setPending(null);
      return;
    }
    if (data) {
      window.location.href = `/recipes/${data.id}`;
    }
  }

  async function handleDelete() {
    setPending("delete");
    setError(null);
    const form = new FormData();
    form.append("id", recipeId);
    const { error: err } = await actions.recipes.delete(form);
    if (err) {
      setError(err.message || "Could not delete recipe");
      setPending(null);
      setConfirmingDelete(false);
      return;
    }
    window.location.href = "/recipes";
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/recipes/${recipeId}/edit`}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edit
        </a>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={pending !== null}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          {pending === "duplicate" ? "Copying…" : "Duplicate"}
        </button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending !== null}
              className="inline-flex items-center rounded-input border border-destructive bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {pending === "delete" ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={pending !== null}
              className="btn-secondary inline-flex items-center px-3 py-1.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-input border border-destructive/30 bg-transparent px-3 py-1.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
