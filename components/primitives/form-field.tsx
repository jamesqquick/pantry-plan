"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label + control slot + optional help/error. Spacing: space-y-1.5 (8pt scale).
 * Use with token-based inputs (border-input, focus-visible:ring-ring, etc.).
 */
export function FormField({
  label,
  htmlFor,
  help,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const id = htmlFor ?? React.useId();

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor ?? id}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {help && !error && (
        <p className="text-xs text-muted-foreground" id={`${id}-help`}>
          {help}
        </p>
      )}
      {error && (
        <p
          className="text-xs text-destructive"
          id={`${id}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
