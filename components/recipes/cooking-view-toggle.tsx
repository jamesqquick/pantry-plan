"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function CookingViewToggle({
  recipeId,
  isCookingView,
  onToggle,
  className,
}: {
  recipeId: string;
  isCookingView: boolean;
  /** When set, toggles via callback and URL without full navigation (enables transitions). */
  onToggle?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const baseHref = `/recipes/${recipeId}`;
  const cookingHref = `${baseHref}?cooking=1`;

  const handleClick = (e: React.MouseEvent) => {
    if (onToggle) {
      e.preventDefault();
      onToggle();
      router.replace(isCookingView ? baseHref : cookingHref);
    }
  };

  const sharedClass = cn(
    "inline-flex cursor-pointer items-center gap-2 rounded-input border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={sharedClass}
        aria-pressed={isCookingView}
      >
        <AppIcon name="chef-hat" size={18} aria-hidden />
        {isCookingView ? "Exit cooking view" : "Cooking view"}
      </button>
    );
  }

  return (
    <Link
      href={isCookingView ? baseHref : cookingHref}
      className={sharedClass}
      aria-pressed={isCookingView}
    >
      <AppIcon name="chef-hat" size={18} aria-hidden />
      {isCookingView ? "Exit cooking view" : "Cooking view"}
    </Link>
  );
}
