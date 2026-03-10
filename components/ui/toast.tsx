"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

const toastVariants = {
  success:
    "border-border bg-success text-success-foreground",
  error:
    "border-border bg-destructive text-destructive-foreground",
} as const;

export type ToastVariant = keyof typeof toastVariants;

interface ToastProps {
  message: string;
  variant: ToastVariant;
  /** Called when toast closes (auto after duration or swipe). Parent should clear state. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Single toast using Radix Toast (focus, swipe, duration). Requires Toaster in layout.
 */
export function Toast({ message, variant, onOpenChange }: ToastProps) {
  return (
    <ToastPrimitive.Root
      duration={3000}
      onOpenChange={onOpenChange}
      className={cn(
        "rounded-input border px-4 py-2 text-sm shadow-sm animate-toast-in",
        toastVariants[variant],
      )}
    >
      <ToastPrimitive.Title className="font-medium">{message}</ToastPrimitive.Title>
    </ToastPrimitive.Root>
  );
}
