"use client";

import Link from "next/link";
import { AppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function CookingViewToggle({
  recipeId,
  isCookingView,
  className,
}: {
  recipeId: string;
  isCookingView: boolean;
  className?: string;
}) {
  const baseHref = `/recipes/${recipeId}`;
  const cookingHref = `${baseHref}?cooking=1`;

  return (
    <Link
      href={isCookingView ? baseHref : cookingHref}
      className={cn(
        "inline-flex items-center gap-2 rounded-input border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      aria-pressed={isCookingView}
    >
      <AppIcon name="chef-hat" size={18} aria-hidden />
      {isCookingView ? "Exit cooking view" : "Cooking view"}
    </Link>
  );
}
