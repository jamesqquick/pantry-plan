"use client";

import { useActionState, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createIngredientAction,
  updateIngredientAction,
  searchGlobalIngredientsForBaseAction,
  getGlobalIngredientBasePrefillAction,
} from "@/app/actions/ingredients.actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportIngredientPicker } from "@/components/recipes/import/import-ingredient-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INGREDIENT_UNITS, UNIT_LABELS } from "@/lib/ingredients/units";
import type {
  CostBasisUnit,
  IngredientDisplayUnit,
  IngredientUnit,
} from "@/generated/prisma/client";
import type { IngredientCategoryOption } from "@/lib/ingredients/category-options";
import {
  IngredientCategoryCombobox,
  normalizeToCatalogName,
} from "@/components/ingredients/ingredient-category-combobox";
import { COST_BASIS_UNITS } from "@/lib/grocery/cost-basis-units";
import { DeleteIngredientButton } from "@/components/ingredients/delete-ingredient-button";

const COST_BASIS_OPTIONS: { value: CostBasisUnit; label: string; hint: string }[] =
  COST_BASIS_UNITS.map((value) => ({
    value,
    label: UNIT_LABELS[value],
    hint: `Cost (cents per ${UNIT_LABELS[value]})`,
  }));

const DISPLAY_UNIT_OPTIONS: { value: IngredientDisplayUnit; label: string }[] = [
  { value: "AUTO", label: "Auto (smart choice)" },
  { value: "GRAM", label: "Gram (g)" },
  { value: "CUP", label: "Cup" },
  { value: "EACH", label: "Each (ea)" },
  { value: "TBSP", label: "Tablespoon (tbsp)" },
  { value: "TSP", label: "Teaspoon (tsp)" },
];

type CreateProps = {
  mode: "create";
};

type EditProps = {
  mode: "edit";
  ingredientId: string;
  initialPreferredDisplayUnit: IngredientDisplayUnit;
  initialValues: {
    name: string;
    category?: string;
    defaultUnit?: IngredientUnit;
    costBasisUnit: CostBasisUnit;
    estimatedCentsPerBasisUnit?: number | null;
    notes?: string;
  };
};

type Props = (CreateProps | EditProps) & {
  categories: IngredientCategoryOption[];
};

export function IngredientForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const initial = isEdit ? props.initialValues : null;
  const { categories } = props;

  const [baseIngredientId, setBaseIngredientId] = useState("");
  const [baseIngredientName, setBaseIngredientName] = useState("");
  const [category, setCategory] = useState(() =>
    isEdit
      ? normalizeToCatalogName(initial?.category, categories)
      : "",
  );
  const [notes, setNotes] = useState("");
  const [estimatedStr, setEstimatedStr] = useState("");

  const [defaultUnit, setDefaultUnit] = useState(initial?.defaultUnit ?? "");
  const [costBasisUnit, setCostBasisUnit] = useState(
    initial?.costBasisUnit ?? "G",
  );
  const [preferredDisplayUnit, setPreferredDisplayUnit] = useState<
    IngredientDisplayUnit
  >(() =>
    isEdit
      ? (props as EditProps).initialPreferredDisplayUnit
      : "AUTO",
  );
  const [createState, createFormAction] = useActionState(createIngredientAction, null);
  const [updateState, updateFormAction] = useActionState(updateIngredientAction, null);
  const state = isEdit ? updateState : createState;

  const formAction = isEdit ? updateFormAction : createFormAction;
  const fieldErrors = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  const handleSearchGlobalBase = useCallback(async (query: string) => {
    const res = await searchGlobalIngredientsForBaseAction(query);
    return res.ok ? res.data : [];
  }, []);

  const handleBaseIngredientChange = useCallback(async (id: string, name: string) => {
    setBaseIngredientId(id);
    setBaseIngredientName(name);
    const res = await getGlobalIngredientBasePrefillAction({ id });
    if (!res.ok) return;
    const d = res.data;
    setCategory(normalizeToCatalogName(d.category, categories));
    setNotes(d.notes?.trim() ?? "");
    setEstimatedStr(
      d.estimatedCentsPerBasisUnit != null && Number.isFinite(d.estimatedCentsPerBasisUnit)
        ? String(d.estimatedCentsPerBasisUnit)
        : ""
    );
    setDefaultUnit(d.defaultUnit ?? "");
    setCostBasisUnit(d.costBasisUnit);
  }, [categories]);

  const clearBaseIngredient = useCallback(() => {
    setBaseIngredientId("");
    setBaseIngredientName("");
  }, []);

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
          {!isEdit && (
            <input type="hidden" name="baseIngredientId" value={baseIngredientId} />
          )}
          {!isEdit && (
            <div className="mb-2 text-sm text-muted-foreground">
              <p>
                Ingredients you create here are{" "}
                <span className="font-medium">Custom</span> to your account.
                Using Custom ingredients with your local brands and store prices
                makes recipe and grocery cost estimates more realistic.
              </p>
            </div>
          )}
          {!isEdit && (
            <div className="space-y-2">
              <label className="mb-1 block text-sm font-medium text-foreground">
                Start from global ingredient (optional)
              </label>
              <p className="text-xs text-muted-foreground">
                Search for a global ingredient to copy category, units, and cost
                defaults. You can change anything before saving.
              </p>
              <ImportIngredientPicker
                catalog={[]}
                value={baseIngredientId}
                displayLabel={baseIngredientName || undefined}
                placeholder="Search global ingredients…"
                onChange={handleBaseIngredientChange}
                onSearch={handleSearchGlobalBase}
                selectedIngredientName={baseIngredientName}
              />
              {fieldErrors.baseIngredientId && (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.baseIngredientId[0]}
                </p>
              )}
              {baseIngredientId ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearBaseIngredient}>
                  Clear base ingredient
                </Button>
              ) : null}
            </div>
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
              htmlFor="ingredient-category"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Category
            </label>
            <IngredientCategoryCombobox
              id="ingredient-category"
              name="category"
              categories={categories}
              value={category}
              onValueChange={setCategory}
              error={!!fieldErrors.category}
            />
            {isEdit && initial?.category && category === "" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Previous category is not in the catalog; choose a category below or leave as none.
              </p>
            )}
            {fieldErrors.category && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {fieldErrors.category[0]}
              </p>
            )}
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
              <SelectTrigger id="defaultUnit">
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
              <SelectTrigger id="costBasisUnit">
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
            {isEdit ? (
              <Input
                id="estimatedCentsPerBasisUnit"
                name="estimatedCentsPerBasisUnit"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 0.5 (cents per gram) or 25 (cents per egg)"
                defaultValue={initial?.estimatedCentsPerBasisUnit ?? ""}
              />
            ) : (
              <Input
                id="estimatedCentsPerBasisUnit"
                name="estimatedCentsPerBasisUnit"
                type="number"
                min={0}
                step="any"
                placeholder="e.g. 0.5 (cents per gram) or 25 (cents per egg)"
                value={estimatedStr}
                onChange={(e) => setEstimatedStr(e.target.value)}
              />
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Choose the unit your price is expressed in (e.g. per pound, per teaspoon).
              Grocery totals use this unit; recipe lines convert using density when needed.
            </p>
          </div>
          {isEdit && (
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
                onValueChange={(v) =>
                  setPreferredDisplayUnit(v as IngredientDisplayUnit)
                }
              >
                <SelectTrigger id="preferredDisplayUnit" className="min-w-0">
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
              <p className="mt-1 text-xs text-muted-foreground">
                How this ingredient appears on order grocery lists (Shopper mode).
                Cost is always calculated from the cost basis unit.
              </p>
              {fieldErrors.preferredDisplayUnit && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {fieldErrors.preferredDisplayUnit[0]}
                </p>
              )}
            </div>
          )}
          <div>
            <label
              htmlFor="notes"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Notes
            </label>
            {isEdit ? (
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={initial?.notes}
                placeholder="Optional notes (Markdown supported)"
              />
            ) : (
              <Textarea
                id="notes"
                name="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes (Markdown supported)"
              />
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Markdown is supported: **bold**, lists, links, and `inline code`.
            </p>
          </div>
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <FormSubmitButton
              className="w-full sm:w-auto"
              pendingLabel={isEdit ? "Saving…" : "Creating…"}
            >
              {isEdit ? "Save changes" : "Create ingredient"}
            </FormSubmitButton>
            {props.mode === "edit" && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => router.push("/ingredients")}
                >
                  Cancel
                </Button>
                <DeleteIngredientButton
                  ingredientId={props.ingredientId}
                  className="w-full sm:w-auto"
                />
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
