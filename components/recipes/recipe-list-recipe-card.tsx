"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { deleteRecipeAction } from "@/app/actions/recipes.actions";

export type RecipeListRecipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  tags?: { id: string; name: string }[];
};

type RecipeListRecipeCardProps = {
  recipe: RecipeListRecipe;
  onDelete: (id: string) => void;
  onToast: (message: string, variant: "success" | "error") => void;
  className?: string;
};

export function RecipeListRecipeCard({ recipe, onDelete, onToast, className }: RecipeListRecipeCardProps) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const totalTime =
    recipe.totalTimeMinutes != null
      ? `${recipe.totalTimeMinutes} min`
      : recipe.prepTimeMinutes != null || recipe.cookTimeMinutes != null
        ? `${(recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)} min`
        : null;
  const servingsLine = recipe.servings != null ? `${recipe.servings} servings` : null;

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMoreOpen(false);
    router.push(`/recipes/${recipe.id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMoreOpen(false);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    const formData = new FormData();
    formData.set("id", recipe.id);
    formData.set("noredirect", "1");
    const result = await deleteRecipeAction(null, formData);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (result.ok) {
      onDelete(recipe.id);
      onToast("Recipe deleted", "success");
    } else {
      onToast(result.error?.message ?? "Failed to delete", "error");
    }
  };

  return (
    <>
      <Link
        href={`/recipes/${recipe.id}`}
        className={cn(
          "group relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-input border border-border bg-card shadow-sm transition-all duration-200",
          "hover:-translate-y-[2px] hover:shadow-md",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
          className
        )}
      >
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-t-input bg-muted">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground transition-transform duration-300 ease-out group-hover:scale-105"
              aria-hidden
            >
              <AppIcon name="chef-hat" size={48} aria-hidden />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          <h3 className="line-clamp-2 text-lg font-semibold tracking-tight text-foreground group-hover:text-primary">
            {recipe.title}
          </h3>

          {(totalTime != null || servingsLine != null) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              {totalTime != null && (
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name="clock" size={14} aria-hidden className="shrink-0" />
                  {totalTime}
                </span>
              )}
              {servingsLine != null && (
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name="users" size={14} aria-hidden className="shrink-0" />
                  {servingsLine}
                </span>
              )}
            </p>
          )}

          {recipe.tags && recipe.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
              {recipe.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-1 flex-col justify-end">
            <span
              className="inline-flex w-full items-center justify-center rounded-input border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground"
              aria-hidden
            >
              View Recipe
            </span>
          </div>
        </div>

        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              className={cn(ICON_BUTTON_CLASS, "h-8 w-8 shrink-0 border border-border bg-background/80 shadow-sm backdrop-blur-sm")}
              aria-label="More actions"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMoreOpen((v) => !v);
              }}
            >
              <AppIcon name="more" size={18} aria-hidden />
            </Button>
            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMoreOpen(false);
                  }}
                />
                <div
                  className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-input border border-border bg-popover shadow-lg text-popover-foreground"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                    onClick={handleEditClick}
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteClick}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </Link>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete recipe?"
        description="This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        loading={deleting}
        loadingLabel="Deleting…"
        closeOnOverlayClick={!deleting}
      />
    </>
  );
}
