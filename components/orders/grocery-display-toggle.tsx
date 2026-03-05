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
    <div className="flex gap-1 rounded-input border border-border bg-muted/50 p-1">
      <button
        type="button"
        onClick={() => onModeChange("shopper")}
        className={`rounded-input px-3 py-1.5 text-sm font-medium transition-colors ${
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
        className={`rounded-input px-3 py-1.5 text-sm font-medium transition-colors ${
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
