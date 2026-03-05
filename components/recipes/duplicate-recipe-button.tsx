"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateRecipeAction } from "@/app/actions/recipes.actions";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/icons";

export function DuplicateRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isPending}
      aria-label={isPending ? "Duplicating recipe…" : "Duplicate recipe"}
      className="h-9 w-9 shrink-0 p-2 inline-flex items-center justify-center"
      onClick={() => {
        startTransition(async () => {
          const formData = new FormData();
          formData.set("recipeId", recipeId);
          const result = await duplicateRecipeAction(null, formData);
          if (result.ok) {
            router.push(`/recipes/${result.data.id}/edit`);
            router.refresh();
          }
        });
      }}
    >
      <AppIcon name="duplicate" size={18} aria-hidden />
    </Button>
  );
}
