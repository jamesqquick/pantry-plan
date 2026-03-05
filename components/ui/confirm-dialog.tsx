"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  error?: string | null;
  cancelLabel?: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "destructive" | "primary" | "default" | "secondary" | "outline" | "ghost" | "link";
  onConfirm: (e: React.MouseEvent) => void | Promise<void>;
  loading?: boolean;
  closeOnOverlayClick?: boolean;
  loadingLabel?: string;
  className?: string;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  error,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  loading = false,
  closeOnOverlayClick = true,
  loadingLabel = "Loading…",
  className,
}: ConfirmDialogProps) {
  if (!open) return null;

  const canClose = !loading && closeOnOverlayClick;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => canClose && onOpenChange(false)}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-input border border-border bg-card p-4 shadow-xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {description != null && (
          <div className="mt-1 text-sm text-muted-foreground">
            {description}
          </div>
        )}
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              if (!loading) onOpenChange(false);
            }}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={(e) => {
              e.stopPropagation();
              void onConfirm(e);
            }}
            disabled={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
