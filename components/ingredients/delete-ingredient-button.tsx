"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteIngredientAction } from "@/app/actions/ingredients.actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";

export function DeleteIngredientButton({ ingredientId }: { ingredientId: string }) {
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
    formData.set("id", ingredientId);
    const result = await deleteIngredientAction(null, formData);
    setDeleting(false);
    if (result.ok) {
      setOpen(false);
      router.push("/ingredients");
      router.refresh();
    } else {
      setError(result.error?.message ?? "Failed to delete");
    }
  };

  return (
    <>
      <Button
        variant="danger"
        className={ICON_LABEL_GAP_CLASS}
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        <AppIcon name="delete" size={18} aria-hidden />
        Delete ingredient
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete ingredient?"
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
