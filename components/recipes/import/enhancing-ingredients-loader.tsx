"use client";

import { AppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type EnhancingIngredientsLoaderProps = {
  size?: "default" | "large";
};

export function EnhancingIngredientsLoader({
  size = "default",
}: EnhancingIngredientsLoaderProps) {
  const isLarge = size === "large";
  const iconSize = isLarge ? 112 : 56;

  return (
    <div
      className={cn(
        "flex items-center justify-center text-muted-foreground animate-chef-float",
        isLarge ? "w-32 h-28" : "w-16 h-14"
      )}
      aria-hidden
    >
      <AppIcon name="chef-hat" size={iconSize} aria-hidden />
    </div>
  );
}
