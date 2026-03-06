"use client";

import { useActionState, useState, useCallback } from "react";
import { setRecipeIngredientsAction } from "@/app/actions/recipe-ingredients.actions";
import { createIngredientAction } from "@/app/actions/ingredients.actions";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IngredientEditorRow } from "@/components/recipes/ingredient-editor-row";
import { formatQuantity, parseQuantityText } from "@/lib/quantity/quantity";
import type { IngredientUnit } from "@/generated/prisma/client";

type CatalogItem = { id: string; name: string };

type RowItem = {
  ingredientId: string;
  ingredientName: string;
  quantityText: string;
  unit?: IngredientUnit | null;
  displayText: string;
  sortOrder: number;
};

/** Server/initial data has quantity (number); we map to quantityText in state */
type InitialRowItem = Omit<RowItem, "quantityText"> & {
  quantity?: number | null;
};

export function StructuredIngredientsEditor({
  recipeId,
  initialItems,
  ingredientsCatalog,
}: {
  recipeId: string;
  initialItems: InitialRowItem[];
  ingredientsCatalog: CatalogItem[];
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>(ingredientsCatalog);
  const mapInitialToRow = (row: InitialRowItem): RowItem => {
    const { quantity, ...rest } = row;
    const quantityText =
      quantity != null && Number.isFinite(quantity)
        ? formatQuantity(quantity)
        : "";
    return { ...rest, quantityText };
  };

  const [items, setItems] = useState<RowItem[]>(
    initialItems.length > 0
      ? initialItems.map(mapInitialToRow)
      : [
          {
            ingredientId: "",
            ingredientName: "",
            quantityText: "",
            displayText: "",
            sortOrder: 0,
          },
        ]
  );

  const [saveState, saveAction] = useActionState(setRecipeIngredientsAction, null);

  const updateRow = useCallback((index: number, patch: Partial<RowItem>) => {
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }, []);

  const addRow = useCallback(() => {
    setItems((prev) => [
      {
        ingredientId: "",
        ingredientName: "",
        quantityText: "",
        displayText: "",
        sortOrder: 0,
      },
      ...prev,
    ]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((row, i) => ({ ...row, sortOrder: i }));
    });
  }, []);

  const handleCreateIngredient = useCallback(
    async (name: string): Promise<{ id: string; name: string } | null> => {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("costBasisUnit", "GRAM");
      const result = await createIngredientAction(null, formData);
      if (result.ok) {
        const newItem = { id: result.data.id, name: name.trim() };
        setCatalog((prev) => [newItem, ...prev]);
        return newItem;
      }
      return null;
    },
    []
  );

  const payload = items
    .map((row, i) => {
      const quantity = parseQuantityText(row.quantityText);
      return {
        ingredientId: row.ingredientId,
        quantity: quantity ?? null,
        unit: row.unit ?? null,
        displayText: row.displayText.trim() || row.ingredientName || "—",
        rawText: null,
        sortOrder: i,
      };
    })
    .filter((row) => row.ingredientId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structured ingredients</CardTitle>
        <p className="text-sm text-muted-foreground">
          Link recipe lines to your ingredients catalog.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {items.map((row, index) => (
            <IngredientEditorRow
              key={index}
              separatorAbove={index > 0}
              displayText={row.displayText}
              onDisplayTextChange={(v) => updateRow(index, { displayText: v })}
              displayTextPlaceholder="Ingredient line"
              quantityText={row.quantityText}
              onQuantityTextChange={(v) => updateRow(index, { quantityText: v })}
              unit={row.unit ?? null}
              onUnitChange={(v) => updateRow(index, { unit: v })}
              catalog={catalog}
              ingredientId={row.ingredientId}
              onChangeIngredient={(id, name) => {
                updateRow(index, {
                  ingredientId: id,
                  ingredientName: name,
                  displayText: row.displayText || name,
                });
              }}
              placeholder="Search or type to create"
              onSelectNew={handleCreateIngredient}
              onRemove={() => removeRow(index)}
              canRemove={items.length > 1}
            />
          ))}
        </div>
        <Button type="button" variant="ghost" onClick={addRow} className={ICON_LABEL_GAP_CLASS}>
          <AppIcon name="add" size={18} aria-hidden />
          Add row
        </Button>

        <form action={saveAction}>
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="items" value={JSON.stringify(payload)} />
          <Button type="submit" className={ICON_LABEL_GAP_CLASS}>
            <AppIcon name="save" size={18} aria-hidden />
            Save structured ingredients
          </Button>
        </form>
        {saveState && !saveState.ok && saveState.error?.message && (
          <p className="text-sm text-destructive" role="alert">
            {saveState.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
