"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

type FormSubmitButtonProps = Omit<
  ComponentProps<typeof Button>,
  "type" | "disabled" | "children"
> & {
  children: React.ReactNode;
  /** Shown while the form action is pending. */
  pendingLabel?: string;
};

/**
 * Submit button that shows a loading state via useFormStatus.
 * Must be rendered inside a <form> that uses action= (server action).
 */
export function FormSubmitButton({
  children,
  pendingLabel = "Loading…",
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
