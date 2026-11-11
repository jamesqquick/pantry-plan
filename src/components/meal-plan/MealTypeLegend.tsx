const LEGEND_ITEMS = [
  {
    slot: "BREAKFAST",
    label: "Breakfast",
    swatchClassName: "bg-amber-200",
  },
  {
    slot: "LUNCH",
    label: "Lunch",
    swatchClassName: "bg-sky-200",
  },
  {
    slot: "DINNER",
    label: "Dinner",
    swatchClassName: "bg-violet-200",
  },
] as const;

export function MealTypeLegend() {
  return (
    <section
      className="rounded-input border border-border bg-card p-4 shadow-sm"
      aria-label="Meal type legend"
    >
      <h2 className="text-sm font-semibold text-foreground">Meal Type Legend</h2>
      <ul className="mt-2 flex flex-wrap gap-4" role="list">
        {LEGEND_ITEMS.map(({ slot, label, swatchClassName }) => (
          <li
            key={slot}
            className="flex items-center gap-2 text-body text-muted-foreground"
          >
            <span
              className={`size-3 shrink-0 rounded-full ${swatchClassName}`}
              aria-hidden
            />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const MEAL_SLOT_SWATCH: Record<string, string> = {
  BREAKFAST: "bg-amber-100 text-amber-900",
  LUNCH: "bg-sky-100 text-sky-900",
  DINNER: "bg-violet-100 text-violet-900",
};
