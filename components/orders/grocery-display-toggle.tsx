"use client";

import { useState } from "react";

export type GroceryDisplayMode = "shopper" | "kitchen";

type GroceryDisplayToggleProps = {
  mode: GroceryDisplayMode;
  onModeChange: (mode: GroceryDisplayMode) => void;
};

export function GroceryDisplayToggle({
  mode,
  onModeChange,
}: GroceryDisplayToggleProps) {
  return (
    <div className="flex h-14 items-center gap-1 rounded-input border border-border bg-muted/50 p-1">
      <button
        type="button"
        onClick={() => onModeChange("shopper")}
        className={`flex h-12 flex-1 items-center justify-center rounded-input px-3 text-sm font-medium transition-colors ${
          mode === "shopper"
            ? "bg-background text-foreground shadow"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Shopper
      </button>
      <button
        type="button"
        onClick={() => onModeChange("kitchen")}
        className={`flex h-12 flex-1 items-center justify-center rounded-input px-3 text-sm font-medium transition-colors ${
          mode === "kitchen"
            ? "bg-background text-foreground shadow"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Kitchen
      </button>
    </div>
  );
}
