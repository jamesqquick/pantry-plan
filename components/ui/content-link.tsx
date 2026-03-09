import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Link for page/content that is readable on both light and dark backgrounds.
 * Uses header-logo token: primary in light, white in dark.
 */
export function ContentLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "text-header-logo underline-offset-4 hover:underline",
        className
      )}
      {...props}
    />
  );
}
