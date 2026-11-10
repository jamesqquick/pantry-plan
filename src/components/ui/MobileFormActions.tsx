import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileFormActionsProps {
  children: ReactNode;
  className?: string;
  dockClassName?: string;
}

export const mobileFormActionButtonClass =
  "min-h-12 min-w-0 flex-1 px-2 text-center leading-tight whitespace-normal sm:min-h-10 sm:flex-none sm:px-4 sm:leading-5 sm:whitespace-nowrap";

export function MobileFormActions({
  children,
  className,
  dockClassName,
}: MobileFormActionsProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0",
        dockClassName,
      )}
    >
      <div
        role="group"
        aria-label="Form actions"
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center gap-2 sm:mx-0 sm:w-auto sm:max-w-none",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
