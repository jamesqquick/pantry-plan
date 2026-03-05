"use client";

import { useState, useRef, useEffect } from "react";
import { QuantityInput, type QuantityValue, type QuantityChangePayload } from "@/components/QuantityInput";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  toDisplayQuantity,
  parseQuantity,
  normalizeQuantityInput,
  decimalFromWholeAndFraction,
} from "@/lib/quantity";
import { cn } from "@/lib/cn";

type QuantityInlineEditorProps = {
  value: QuantityValue;
  onChange: (next: QuantityChangePayload) => void;
  units: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
};

export function QuantityInlineEditor({
  value,
  onChange,
  units,
  disabled = false,
  className,
}: QuantityInlineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [powerInput, setPowerInput] = useState("");
  const [editValue, setEditValue] = useState<QuantityValue>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const unitLabel = value.unit
    ? units.find((u) => u.value === value.unit)?.label ?? value.unit
    : "";
  const displayText = [
    toDisplayQuantity(value.whole, value.fraction),
    unitLabel,
  ]
    .filter(Boolean)
    .join(" ");

  const startEditing = () => {
    if (disabled) return;
    setEditing(true);
    setEditValue(value);
    setPowerInput("");
  };

  const commitEdit = () => {
    const decimal = decimalFromWholeAndFraction(editValue.whole, editValue.fraction);
    onChange({ ...editValue, decimal });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(value);
    setPowerInput("");
    setEditing(false);
  };

  const handlePowerInputBlur = () => {
    const s = powerInput.trim();
    if (s === "") return;
    const parsed = parseQuantity(normalizeQuantityInput(s));
    if (parsed.decimal != null) {
      setEditValue({
        whole: parsed.whole ?? 0,
        fraction: parsed.fraction,
        unit: editValue.unit,
      });
    }
  };

  const handlePowerInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePowerInputBlur();
      (e.currentTarget as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  };

  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        commitEdit();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editing, editValue]);

  useEffect(() => {
    if (!editing) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelEdit();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        disabled={disabled}
        className={cn(
          "cursor-pointer rounded px-1 py-0.5 text-left text-foreground hover:bg-muted",
          !displayText && "italic text-muted-foreground",
          className
        )}
        aria-label="Edit quantity"
      >
        {displayText || "Add quantity"}
      </button>
    );
  }

  return (
    <div ref={containerRef} className={cn("space-y-2 rounded-md border border-border bg-background p-2", className)}>
      <Input
        type="text"
        placeholder="e.g. 1 1/2 or ½"
        value={powerInput}
        onChange={(e) => setPowerInput(e.target.value)}
        onBlur={handlePowerInputBlur}
        onKeyDown={handlePowerInputKeyDown}
        className="text-sm"
        aria-label="Power input (fraction or number)"
      />
      <QuantityInput
        value={editValue}
        onChange={(next) => setEditValue({ whole: next.whole, fraction: next.fraction, unit: next.unit })}
        units={units}
        disabled={disabled}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={cancelEdit}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={commitEdit}>
          Save
        </Button>
      </div>
    </div>
  );
}
