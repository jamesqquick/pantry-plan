"use client";

import { useCallback } from "react";
import {
  parseQuantityText,
  formatQuantity,
  normalizeQuantityText,
  adjustQuantity,
} from "@/lib/quantity/quantity";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type SmartQuantityInputProps = {
  valueText: string;
  onChangeText: (v: string) => void;
  onCommit?: (v: {
    value: number | null;
    text: string;
    isValid: boolean;
  }) => void;
  error?: string | null;
  disabled?: boolean;
  ariaLabel?: string;
  /** Merged with the input's className (e.g. for border color when needs attention). */
  className?: string;
};

export function SmartQuantityInput({
  valueText,
  onChangeText,
  onCommit,
  error,
  disabled = false,
  ariaLabel = "Quantity",
  className,
}: SmartQuantityInputProps) {
  const handleBlur = useCallback(() => {
    const result = normalizeQuantityText(valueText);
    if (result.isValid) {
      onChangeText(result.normalizedText);
    }
    onCommit?.({
      value: result.value,
      text: result.isValid ? result.normalizedText : valueText,
      isValid: result.isValid,
    });
  }, [valueText, onChangeText, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const value = parseQuantityText(valueText) ?? 0;
        const next = adjustQuantity(value, "up");
        onChangeText(formatQuantity(next));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const value = parseQuantityText(valueText) ?? 0;
        const next = adjustQuantity(value, "down");
        onChangeText(formatQuantity(next));
      }
    },
    [valueText, onChangeText]
  );

  return (
    <div className="min-w-0">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="1 1/2"
        value={valueText}
        onChange={(e) => onChangeText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        error={!!error}
        className={cn("px-2 text-sm", className)}
      />
      {error && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
