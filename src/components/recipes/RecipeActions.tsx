import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import { EllipsisVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { runActionWithRecovery } from "@/lib/action-error";

export interface RecipeActionsProps {
  recipeId: string;
  /** True when the recipe has ingredient lines without an ingredientId mapping. */
  hasUnmappedIngredients?: boolean;
}

/** Detail-page recipe management actions, kept behind a compact More menu. */
export default function RecipeActions({
  recipeId,
  hasUnmappedIngredients = false,
}: RecipeActionsProps) {
  const [pending, setPending] = useState<"duplicate" | "delete" | "enhance" | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleDuplicate() {
    setMenuOpen(false);
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
    if (data) window.location.href = `/recipes/${data.id}`;
  }

  async function handleEnhance() {
    setMenuOpen(false);
    setPending("enhance");
    setError(null);
    setEnhanceResult(null);
    const { data, error: err } = await actions.enhance.recipeIngredients({ recipeId });
    if (err) {
      setError(err.message || "Could not enhance ingredients");
      setPending(null);
      return;
    }
    const mapped = data.items.filter((i) => i.ingredientId).length;
    setEnhanceResult(`${mapped}/${data.items.length} ingredients mapped. Reloading...`);
    setPending(null);
    setTimeout(() => window.location.reload(), 800);
  }

  async function handleDelete() {
    setMenuOpen(false);
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
      <div ref={menuRef} className="relative">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={pending !== null}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="More recipe actions"
          title="More recipe actions"
          className="h-8 w-8 p-0"
        >
          <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Recipe actions"
            className="absolute right-0 top-full z-20 mt-2 max-w-[calc(100vw-1rem)] min-w-48 rounded-input border border-border bg-popover p-1 shadow-lg"
          >
            <a
              role="menuitem"
              href={`/meal-plan?addRecipe=${recipeId}`}
              onClick={() => setMenuOpen(false)}
              className="flex cursor-pointer whitespace-nowrap rounded px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
            >
              Add to meal plan
            </a>
            <a
              role="menuitem"
              href={`/recipes/${recipeId}/edit`}
              onClick={() => setMenuOpen(false)}
              className="flex cursor-pointer whitespace-nowrap rounded px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
            >
              Edit
            </a>
            {hasUnmappedIngredients && (
              <button
                type="button"
                role="menuitem"
                onClick={handleEnhance}
                disabled={pending !== null}
                className="flex w-full cursor-pointer whitespace-nowrap rounded px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                {pending === "enhance" && <Spinner className="mr-2 h-3.5 w-3.5" label="Mapping ingredients" />}
                {pending === "enhance" ? "Mapping…" : "Map ingredients"}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleDuplicate}
              disabled={pending !== null}
              className="flex w-full cursor-pointer whitespace-nowrap rounded px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
            >
              {pending === "duplicate" ? "Copying…" : "Duplicate"}
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDeleteDialogOpen(true);
              }}
              disabled={pending !== null}
              className="flex w-full cursor-pointer whitespace-nowrap rounded px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {error && !deleteDialogOpen && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {enhanceResult && !error && (
        <p className="text-xs text-green-700 dark:text-green-300">{enhanceResult}</p>
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
