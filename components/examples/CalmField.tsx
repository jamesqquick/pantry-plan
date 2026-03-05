"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CalmFieldProps {
  label: string;
  helpText?: string;
  error?: string;
  className?: string;
  inputClassName?: string;
  /** Input id for label association */
  id?: string;
  /** Pass through to the underlying input */
  inputProps?: React.ComponentPropsWithoutRef<"input">;
}

/**
 * Example component demonstrating token usage for form fields:
 * label, input with border-input, placeholder and focus ring tokens,
 * help text with muted-foreground.
 */
export function CalmField({
  label,
  helpText,
  error,
  className,
  inputClassName,
  id: idProp,
  inputProps = {},
}: CalmFieldProps) {
  const id = idProp ?? React.useId();
  const { className: inputPropsClass, ...restInputProps } = inputProps;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={helpText ? `${id}-help` : error ? `${id}-error` : undefined}
        className={cn(
          "h-12 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50",
          error && "border-destructive focus-visible:ring-destructive/20",
          inputClassName,
          inputPropsClass
        )}
        {...restInputProps}
      />
      {helpText && !error && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
