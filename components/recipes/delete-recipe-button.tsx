"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRecipeAction } from "@/app/actions/recipes.actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppIcon } from "@/components/ui/icons";

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setDeleting(true);
    const formData = new FormData();
    formData.set("id", recipeId);
    formData.set("noredirect", "1");
    const result = await deleteRecipeAction(null, formData);
    setDeleting(false);
    if (result.ok) {
      setOpen(false);
      router.push("/recipes");
      router.refresh();
    } else {
      setError(result.error?.message ?? "Failed to delete");
    }
  };

  return (
    <>
      <Button
        variant="danger"
        aria-label="Delete recipe"
        className="h-9 w-9 shrink-0 p-2 inline-flex items-center justify-center"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        <AppIcon name="delete" size={18} aria-hidden />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete recipe?"
        description="This cannot be undone."
        error={error}
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
