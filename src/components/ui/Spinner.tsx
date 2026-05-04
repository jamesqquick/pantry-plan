import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  /** Accessible label for screen readers. Defaults to "Loading". */
  label?: string;
}

/**
 * Simple SVG spinner. Uses currentColor so it inherits text color.
 * Usage: <Spinner className="h-4 w-4" />
 */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
