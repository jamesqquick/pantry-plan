"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export type QuantityWholeNumDenInputProps = {
  whole: number | null;
  numerator: number | null;
  denominator: number | null;
  onChange: (whole: number | null, numerator: number | null, denominator: number | null) => void;
  onBlur?: () => void;
  className?: string;
  /** Compact styling (e.g. import table) */
  compact?: boolean;
  /** Mark as invalid for a11y */
  "aria-invalid"?: boolean;
};

function toInputValue(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (n === 0) return "0";
  return String(n);
}

function fromInputValue(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export function QuantityWholeNumDenInput({
  whole,
  numerator,
  denominator,
  onChange,
  onBlur,
  className,
  compact = false,
  "aria-invalid": ariaInvalid,
}: QuantityWholeNumDenInputProps) {
  const inputClass = compact ? "w-10 text-center text-sm" : "w-12 text-center";

  const handleWhole = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = fromInputValue(e.target.value);
    onChange(v, numerator, denominator);
  };
  const handleNum = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = fromInputValue(e.target.value);
    onChange(whole, v, denominator);
  };
  const handleDen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = fromInputValue(e.target.value);
    onChange(whole, numerator, v);
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-0.5", className)} role="group" aria-label="Quantity (whole, numerator, denominator)">
      <Input
        type="number"
        min={0}
        step={1}
        placeholder="0"
        className={inputClass}
        value={toInputValue(whole)}
        onChange={handleWhole}
        onBlur={onBlur}
        aria-label="Whole part"
        aria-invalid={ariaInvalid}
      />
      <Input
        type="number"
        min={0}
        step={1}
        placeholder="0"
        className={inputClass}
        value={toInputValue(numerator)}
        onChange={handleNum}
        onBlur={onBlur}
        aria-label="Numerator"
        aria-invalid={ariaInvalid}
      />
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <Input
        type="number"
        min={0}
        step={1}
        placeholder="—"
        className={inputClass}
        value={toInputValue(denominator)}
        onChange={handleDen}
        onBlur={onBlur}
        aria-label="Denominator (0 = no fraction)"
        aria-invalid={ariaInvalid}
      />
    </div>
  );
}
