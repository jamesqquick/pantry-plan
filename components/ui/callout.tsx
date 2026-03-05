"use client";

import {
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CalloutVariant = "success" | "error" | "warning" | "info";

const variantStyles: Record<CalloutVariant, string> = {
  success: "border-success/30 bg-success/15",
  error: "border-destructive/30 bg-destructive/15",
  warning: "border-warning/30 bg-warning/15",
  info: "border-info/30 bg-info/15",
};

const variantIconStyles: Record<CalloutVariant, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const variantIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

type CalloutProps = {
  variant?: CalloutVariant;
  className?: string;
  children: React.ReactNode;
};

export function Callout({
  variant = "info",
  className,
  children,
}: CalloutProps) {
  const Icon = variantIcons[variant];
  return (
    <div
      className={cn(
        "rounded-input border px-4 py-3 text-sm flex items-start gap-3",
        variantStyles[variant],
        className
      )}
      role="status"
    >
      <Icon
        className={cn("size-5 shrink-0 mt-0.5", variantIconStyles[variant])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
