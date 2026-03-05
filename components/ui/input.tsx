"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const inputBaseClass =
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-14 w-full min-w-0 rounded-input border border-input bg-background px-4 py-3 text-base transition-colors outline-none file:inline-flex file:h-8 file:[border-radius:10px] file:border-0 file:bg-transparent file:text-base file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive";

const iconWrapperClass =
  "pointer-events-none absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, leadingIcon, trailingIcon, ...props }, ref) => {
    const hasLeading = leadingIcon != null;
    const hasTrailing = trailingIcon != null;

    const inputEl = (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        aria-invalid={error}
        className={cn(
          inputBaseClass,
          hasLeading ? "pl-10 pr-4" : "px-4",
          hasTrailing && !hasLeading && "pr-10",
          hasLeading && hasTrailing && "pl-10 pr-10",
          error &&
            "border-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
          className
        )}
        {...props}
      />
    );

    if (!hasLeading && !hasTrailing) {
      return inputEl;
    }

    return (
      <div className="relative w-full">
        {inputEl}
        {hasLeading && (
          <span className={cn(iconWrapperClass, "left-2.5")}>{leadingIcon}</span>
        )}
        {hasTrailing && (
          <span className={cn(iconWrapperClass, "right-2.5")}>
            {trailingIcon}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
