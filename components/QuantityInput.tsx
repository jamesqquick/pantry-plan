"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALLOWED_FRACTIONS,
  decimalFromWholeAndFraction,
} from "@/lib/quantity";
import { cn } from "@/lib/cn";

export type QuantityValue = {
  whole: number | null;
  fraction: string | null;
  unit: string | null;
};

export type QuantityChangePayload = QuantityValue & {
  decimal: number | null;
};

type QuantityInputProps = {
  value: QuantityValue;
  onChange: (next: QuantityChangePayload) => void;
  units: { value: string; label: string }[];
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function QuantityInput({
  value,
  onChange,
  units,
  disabled = false,
  label,
  className,
}: QuantityInputProps) {
  const idWhole = useId();
  const idFraction = useId();
  const idUnit = useId();

  const handleWholeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const whole = raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0);
    if (whole !== null && Number.isNaN(whole)) return;
    const next: QuantityValue = { ...value, whole };
    const decimal = decimalFromWholeAndFraction(next.whole, next.fraction);
    onChange({ ...next, decimal });
  };

  const handleFractionChange = (v: string) => {
    const fraction = v === "__none__" ? null : v;
    const next: QuantityValue = { ...value, fraction };
    const decimal = decimalFromWholeAndFraction(next.whole, next.fraction);
    onChange({ ...next, decimal });
  };

  const handleUnitChange = (v: string) => {
    const unit = v === "__none__" ? null : v;
    const next: QuantityValue = { ...value, unit };
    const decimal = decimalFromWholeAndFraction(next.whole, next.fraction);
    onChange({ ...next, decimal });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {label && (
        <label htmlFor={idWhole} className="sr-only">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1">
        <Input
          id={idWhole}
          type="number"
          min={0}
          step={1}
          placeholder="0"
          value={value.whole ?? ""}
          onChange={handleWholeChange}
          disabled={disabled}
          className="w-16 text-sm"
          aria-label="Whole number"
        />
        <Select
          value={value.fraction ?? "__none__"}
          onValueChange={handleFractionChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={idFraction}
            className="rounded-input border border-input bg-background pl-2 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Fraction"
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {ALLOWED_FRACTIONS.filter(Boolean).map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Select
        value={value.unit ?? "__none__"}
        onValueChange={handleUnitChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={idUnit}
          className="min-w-28 rounded-input border border-input bg-background pl-2 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Unit"
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="min-w-32">
          <SelectItem value="__none__">—</SelectItem>
          {units.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
