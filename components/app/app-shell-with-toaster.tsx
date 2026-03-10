"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Radix Toast provider around app shell so any client subtree can render Toast roots.
 */
export function AppShellWithToaster({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastPrimitive.Provider duration={3000} swipeDirection="up" label="Notification">
      {children}
      <ToastPrimitive.Viewport
        className={cn(
          "fixed bottom-4 left-1/2 z-50 flex max-h-screen w-full max-w-md -translate-x-1/2 flex-col gap-2 p-4",
          "outline-none",
        )}
      />
    </ToastPrimitive.Provider>
  );
}
