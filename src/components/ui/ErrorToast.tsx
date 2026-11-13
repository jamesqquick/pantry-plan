import { useEffect } from "react";

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(onDismiss, 8_000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive px-4 py-3 text-body font-medium text-destructive-foreground shadow-lg lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss error message"
        onClick={onDismiss}
        className="shrink-0 rounded px-1 text-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Dismiss
      </button>
    </div>
  );
}
