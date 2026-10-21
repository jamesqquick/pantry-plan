import { useId } from "react";
import { RECIPE_SCALE_VALUES, type RecipeScale } from "@/features/recipes/recipe-scaling";

interface RecipeScaleControlProps {
  value: RecipeScale;
  onChange: (value: RecipeScale) => void;
  disabled: boolean;
}

export function RecipeScaleControl({ value, onChange, disabled }: RecipeScaleControlProps) {
  const name = useId();

  return (
    <fieldset className="min-w-0">
      <legend className="font-ui text-sm font-semibold">Batch size</legend>
      <div className="mt-3 grid max-w-xl grid-cols-3 gap-2 sm:grid-cols-6">
        {RECIPE_SCALE_VALUES.map((scale) => (
          <label key={scale} className="cursor-pointer has-disabled:cursor-not-allowed">
            <input
              type="radio"
              name={name}
              value={scale}
              aria-label={scale === 1 ? "1×, original batch" : `${scale}×`}
              checked={value === scale}
              disabled={disabled && scale !== 1}
              onChange={() => onChange(scale)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center justify-center rounded-input border border-border bg-card px-3 font-ui text-sm font-semibold tabular-nums text-card-foreground transition-colors hover:border-outline-strong peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-40 motion-reduce:transition-none">
              {scale}×
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
