"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  error?: string | null;
  cancelLabel?: string;
  confirmLabel: string;
  confirmVariant?:
    | "danger"
    | "destructive"
    | "primary"
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "link";
  onConfirm: (e: React.MouseEvent) => void | Promise<void>;
  loading?: boolean;
  closeOnOverlayClick?: boolean;
  loadingLabel?: string;
  className?: string;
};

/**
 * Confirmation modal using Radix Dialog (focus trap, portal, escape).
 * Content uses role="alertdialog" for assertive confirmations.
 */
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
  const canClose = !loading && closeOnOverlayClick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={cn("max-w-sm", className)}
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
      >
        <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
        {description != null && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
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
      </DialogContent>
    </Dialog>
  );
}
