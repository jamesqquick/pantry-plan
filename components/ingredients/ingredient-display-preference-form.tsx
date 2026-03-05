"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateIngredientPreferencesAction } from "@/app/actions/ingredients.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DISPLAY_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "AUTO", label: "Auto (smart choice)" },
  { value: "GRAM", label: "Gram (g)" },
  { value: "CUP", label: "Cup" },
  { value: "EACH", label: "Each (ea)" },
  { value: "TBSP", label: "Tablespoon (tbsp)" },
  { value: "TSP", label: "Teaspoon (tsp)" },
];

type Props = {
  ingredientId: string;
  currentPreferredDisplayUnit: string;
};

export function IngredientDisplayPreferenceForm({
  ingredientId,
  currentPreferredDisplayUnit,
}: Props) {
  const router = useRouter();
  const [preferredDisplayUnit, setPreferredDisplayUnit] = useState(
    currentPreferredDisplayUnit
  );
  const [state, formAction] = useActionState(updateIngredientPreferencesAction, null);

  if (state?.ok) {
    router.refresh();
  }

  const fieldErrors = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  return (
    <Card key={`pref-${ingredientId}-${currentPreferredDisplayUnit}`}>
      <CardHeader>
        <CardTitle className="text-base">Grocery list display</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          How this ingredient appears on order grocery lists (Shopper mode). Cost is always calculated from the cost basis unit.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="ingredientId" value={ingredientId} />
          <div>
            <label
              htmlFor="preferredDisplayUnit"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Preferred display unit
            </label>
            <input
              type="hidden"
              name="preferredDisplayUnit"
              value={preferredDisplayUnit}
            />
            <Select
              value={preferredDisplayUnit}
              onValueChange={setPreferredDisplayUnit}
            >
              <SelectTrigger
                id="preferredDisplayUnit"
                className="block w-full max-w-xs"
              >
                <SelectValue placeholder="Preferred display unit" />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_UNIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.preferredDisplayUnit && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {fieldErrors.preferredDisplayUnit[0]}
              </p>
            )}
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <Button type="submit" variant="secondary" className="text-sm">
            Save display preference
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
