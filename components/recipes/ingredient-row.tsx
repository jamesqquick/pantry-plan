function shouldShowMapped(raw: string, mapped?: string | null): boolean {
  if (!mapped?.trim()) return false;
  return raw.trim().toLowerCase() !== mapped.trim().toLowerCase();
}

type IngredientRowProps = {
  originalLine: string;
  displayLine?: string;
  mappedIngredientName?: string;
  matchType?: string;
  confidence?: number;
  recipeId: string;
  isMapped: boolean;
  isLast?: boolean;
  number?: number;
};

export function IngredientRow({
  originalLine,
  displayLine,
  mappedIngredientName,
  isLast = false,
  number,
}: IngredientRowProps) {
  const displayText = (displayLine?.trim() || originalLine.trim() || mappedIngredientName?.trim() || "—").trim() || "—";
  const showMapped = !displayLine && shouldShowMapped(originalLine, mappedIngredientName);

  const content = (
    <p className="text-base text-foreground">
        {displayText}
        {showMapped && (
          <span className="text-muted-foreground"> ({mappedIngredientName})</span>
        )}
      </p>
  );

  if (number != null) {
    return (
      <li
        className={`flex items-center gap-3 ${!isLast ? "border-b border-border" : ""}`}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden
        >
          {number}
        </span>
        <div className="min-w-0 flex-1 py-1.5 leading-snug">
          {content}
        </div>
      </li>
    );
  }

  return (
    <li
      className={`py-1.5 leading-snug ${!isLast ? "border-b border-border" : ""}`}
    >
      {content}
    </li>
  );
}
