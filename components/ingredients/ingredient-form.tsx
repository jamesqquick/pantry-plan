"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createIngredientAction,
  updateIngredientAction,
} from "@/app/actions/ingredients.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INGREDIENT_UNITS, UNIT_LABELS } from "@/lib/ingredients/units";
import type { CostBasisUnit, IngredientUnit } from "@/generated/prisma/client";

const COST_BASIS_OPTIONS: { value: CostBasisUnit; label: string; hint: string }[] = [
  { value: "GRAM", label: "Gram", hint: "Cost (cents per gram)" },
  { value: "CUP", label: "Cup", hint: "Cost (cents per cup)" },
  { value: "EACH", label: "Each", hint: "Cost (cents per item)" },
];

type CreateProps = {
  mode: "create";
};

type EditProps = {
  mode: "edit";
  ingredientId: string;
  initialValues: {
    name: string;
    category?: string;
    defaultUnit?: IngredientUnit;
    costBasisUnit: CostBasisUnit;
    estimatedCentsPerBasisUnit?: number | null;
    notes?: string;
  };
};

type Props = CreateProps | EditProps;

export function IngredientForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const initial = isEdit ? props.initialValues : null;

  const [defaultUnit, setDefaultUnit] = useState(initial?.defaultUnit ?? "");
  const [costBasisUnit, setCostBasisUnit] = useState(
    initial?.costBasisUnit ?? "GRAM"
  );
  const [createState, createFormAction] = useActionState(createIngredientAction, null);
  const [updateState, updateFormAction] = useActionState(updateIngredientAction, null);
  const state = isEdit ? updateState : createState;

  useEffect(() => {
    if (state && state.ok && "data" in state && state.data?.id) {
      if (isEdit) {
        router.refresh();
        router.push("/ingredients");
      } else {
        router.push(`/ingredients/${state.data.id}`);
      }
    }
  }, [state, isEdit, router]);

  const formAction = isEdit ? updateFormAction : createFormAction;
  const fieldErrors = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  return (
    <Card>
      {!isEdit && (
        <CardHeader>
          <CardTitle>New ingredient</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <form action={formAction} className="space-y-4">
          {isEdit && (
            <input type="hidden" name="id" value={props.ingredientId} />
          )}
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Name *
            </label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={initial?.name}
              error={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {fieldErrors.name[0]}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="category"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Category
            </label>
            <Input
              id="category"
              name="category"
              placeholder="e.g. Dairy, Produce"
              defaultValue={initial?.category}
            />
          </div>
          <div>
            <label
              htmlFor="defaultUnit"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Default unit
            </label>
            <input type="hidden" name="defaultUnit" value={defaultUnit} />
            <Select
              value={defaultUnit || "__none__"}
              onValueChange={(v) => setDefaultUnit(v === "__none__" ? "" : v)}
            >
              <SelectTrigger
                id="defaultUnit"
                className="block w-full"
              >
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {INGREDIENT_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              htmlFor="costBasisUnit"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Cost basis unit
            </label>
            <input type="hidden" name="costBasisUnit" value={costBasisUnit} />
            <Select
              value={costBasisUnit}
              onValueChange={(v) => setCostBasisUnit(v as CostBasisUnit)}
            >
              <SelectTrigger
                id="costBasisUnit"
                className="block w-full"
              >
                <SelectValue placeholder="Cost basis unit" />
              </SelectTrigger>
              <SelectContent>
                {COST_BASIS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label
              htmlFor="estimatedCentsPerBasisUnit"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Estimated cost (cents per basis unit)
            </label>
            <Input
              id="estimatedCentsPerBasisUnit"
              name="estimatedCentsPerBasisUnit"
              type="number"
              min={0}
              step={0.01}
              placeholder="e.g. 0.5 (cents per gram) or 25 (cents per egg)"
              defaultValue={initial?.estimatedCentsPerBasisUnit ?? ""}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              GRAM → cents per gram; CUP → cents per cup; EACH → cents per item
            </p>
          </div>
          <div>
            <label
              htmlFor="notes"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Notes
            </label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial?.notes}
              placeholder="Optional notes"
            />
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit">
              {isEdit ? "Save changes" : "Create ingredient"}
            </Button>
            {isEdit && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/ingredients")}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
