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
}

export function Toast({ message, variant }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-4 left-1/2 z-50 rounded-input border border-border px-4 py-2 text-sm shadow-sm animate-toast-in",
        toastVariants[variant]
      )}
    >
      {message}
    </div>
  );
}
