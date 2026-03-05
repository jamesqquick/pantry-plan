import { cn } from "@/lib/cn";

const SECTION_WRAPPER_CLASS =
  "border-b border-border pt-4 pb-4 mb-6";

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
  variant = "default",
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "section";
}) {
  if (variant === "section") {
    return (
      <div className={cn(SECTION_WRAPPER_CLASS, className)}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">{title}</h2>
            {subtitle != null && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action != null ? action : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mb-6 flex items-center justify-between",
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {title}
        </h3>
        {subtitle != null && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action != null ? action : null}
    </div>
  );
}
