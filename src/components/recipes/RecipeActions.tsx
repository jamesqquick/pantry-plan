import { useState } from "react";
import { actions } from "astro:actions";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { runActionWithRecovery } from "@/lib/action-error";

export interface RecipeActionsProps {
  recipeId: string;
  /** True when the recipe has ingredient lines without an ingredientId mapping. */
  hasUnmappedIngredients?: boolean;
}

/**
 * Detail-page action cluster: edit link + duplicate + delete.
 * Duplicate and delete both go to the recipes.* actions we shipped in Phase 5.
 */
export default function RecipeActions({
  recipeId,
  hasUnmappedIngredients = false,
}: RecipeActionsProps) {
  const [pending, setPending] = useState<
    "duplicate" | "delete" | "enhance" | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<string | null>(null);

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

  async function handleEnhance() {
    setPending("enhance");
    setError(null);
    setEnhanceResult(null);
    const { data, error: err } = await actions.enhance.recipeIngredients({
      recipeId,
    });
    if (err) {
      setError(err.message || "Could not enhance ingredients");
      setPending(null);
      return;
    }
    const mapped = data.items.filter((i) => i.ingredientId).length;
    setEnhanceResult(`${mapped}/${data.items.length} ingredients mapped. Reloading...`);
    setPending(null);
    // Brief pause so the user sees the result, then reload
    setTimeout(() => window.location.reload(), 800);
  }

  async function handleDelete() {
    setPending("delete");
    setError(null);

    const form = new FormData();
    form.append("id", recipeId);
    await runActionWithRecovery({
      action: () => actions.recipes.delete(form),
      fallback: "Could not delete recipe.",
      onError: setError,
      onSuccess: () => {
        window.location.href = "/recipes";
      },
      onSettled: () => setPending(null),
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          href={`/recipes/${recipeId}/edit`}
          className="gap-1.5"
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
        </Button>
        {hasUnmappedIngredients && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEnhance}
            disabled={pending !== null}
            className="gap-1.5"
          >
            {/* Lucide Sparkles */}
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
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              <path d="M20 3v4" />
              <path d="M22 5h-4" />
              <path d="M4 17v2" />
              <path d="M5 18H3" />
            </svg>
            {pending === "enhance" && <Spinner className="h-3.5 w-3.5" label="Mapping ingredients" />}
            {pending === "enhance" ? "Mapping\u2026" : "Map ingredients"}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDuplicate}
          disabled={pending !== null}
          className="gap-1.5"
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
        </Button>
        <Button
          variant="ghost-danger"
          size="sm"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={pending !== null}
          className="gap-1.5"
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
        </Button>
      </div>
      {error && !deleteDialogOpen && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {enhanceResult && !error && (
        <p className="text-xs text-green-700 dark:text-green-300">
          {enhanceResult}
        </p>
      )}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete recipe?"
        description="This recipe and its ingredients, instructions, and tags will be permanently deleted. This cannot be undone."
        confirmLabel="Yes, delete"
        pendingLabel="Deleting..."
        pending={pending === "delete"}
        error={error}
        onConfirm={handleDelete}
      />
    </div>
  );
}
