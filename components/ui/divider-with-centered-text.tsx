import { cn } from "@/lib/utils";

type DividerWithCenteredTextProps = {
  /** Text or content to show between the divider lines */
  children: React.ReactNode;
  className?: string;
};

export function DividerWithCenteredText({
  children,
  className,
}: DividerWithCenteredTextProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 lg:w-96",
        className
      )}
      role="presentation"
    >
      <div className="h-px flex-1 bg-border" aria-hidden />
      <span className="shrink-0 text-base text-muted-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
