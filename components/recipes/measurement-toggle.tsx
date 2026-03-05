"use client";

export type MeasurementMode = "original" | "weight" | "volume" | "both";

const MODES: { value: MeasurementMode; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "weight", label: "Weight" },
  { value: "volume", label: "Volume" },
  { value: "both", label: "Both" },
];

export function MeasurementToggle({
  mode,
  onModeChange,
}: {
  mode: MeasurementMode;
  onModeChange: (mode: MeasurementMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Measurement display"
      className="flex flex-wrap gap-1 rounded-input border border-border bg-muted/50 p-1"
    >
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onModeChange(value)}
          aria-pressed={mode === value}
          className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === value
              ? "bg-background text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
