"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  enhanceRecipeIngredientsAction,
  type EnhancedRecipeIngredientResult,
} from "@/app/actions/enhance-recipe-ingredients.actions";
import { setRecipeIngredientsAction } from "@/app/actions/recipe-ingredients.actions";
import {
  createIngredientAction,
  searchIngredientsForPickerAction,
} from "@/app/actions/ingredients.actions";
import { EnhancingIngredientsLoader } from "@/components/recipes/import/enhancing-ingredients-loader";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { IngredientEditorRow } from "@/components/recipes/ingredient-editor-row";
import { formatQuantity, parseQuantityText } from "@/lib/quantity/quantity";
import type { IngredientUnit } from "@/generated/prisma/client";

type EnhanceRecipeClientProps = {
  recipeId: string;
  recipeTitle?: string;
};

type EditableRow = {
  displayText: string;
  quantityText: string;
  unit: IngredientUnit | null;
  ingredientId: string;
  ingredientName: string;
  rawText: string | null;
  sortOrder: number;
};

function toEditableRow(item: EnhancedRecipeIngredientResult): EditableRow {
  return {
    displayText: item.displayText,
    quantityText:
      item.quantity != null && Number.isFinite(item.quantity)
        ? formatQuantity(item.quantity)
        : "",
    unit: item.unit,
    ingredientId: item.ingredientId ?? "",
    ingredientName: item.ingredientName ?? "",
    rawText: item.rawText,
    sortOrder: item.sortOrder,
  };
}

function countFullyEnhanced(items: EnhancedRecipeIngredientResult[]): number {
  return items.filter(
    (i) =>
      i.ingredientId &&
      i.quantity != null &&
      Number.isFinite(i.quantity) &&
      i.unit != null
  ).length;
}

export function EnhanceRecipeClient({
  recipeId,
  recipeTitle,
}: EnhanceRecipeClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [fullyEnhancedCount, setFullyEnhancedCount] = useState(0);
  const [saveLoading, setSaveLoading] = useState(false);
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const formData = new FormData();
    formData.set("recipeId", recipeId);
    enhanceRecipeIngredientsAction(null, formData).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok && result.data) {
        const items = result.data.items;
        setRows(items.map(toEditableRow));
        setFullyEnhancedCount(countFullyEnhanced(items));
      } else {
        setError(
          result.ok ? "" : result.error?.message ?? "Failed to enhance ingredients."
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const updateRow = useCallback((index: number, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }, []);

  const handleSearchIngredients = useCallback(async (query: string) => {
    const res = await searchIngredientsForPickerAction(query);
    return res.ok ? res.data : [];
  }, []);

  const handleSave = useCallback(async () => {
    setSaveLoading(true);
    const items = rows.map((r) => ({
      ingredientId: r.ingredientId?.trim() || undefined,
      quantity: parseQuantityText(r.quantityText) ?? undefined,
      unit: r.unit ?? undefined,
      displayText: r.displayText.trim() || "—",
      rawText: r.rawText?.trim() || undefined,
      sortOrder: r.sortOrder,
    }));
    const formData = new FormData();
    formData.set("recipeId", recipeId);
    formData.set("items", JSON.stringify(items));
    const result = await setRecipeIngredientsAction(null, formData);
    setSaveLoading(false);
    if (result.ok) {
      router.push(`/recipes/${recipeId}`);
      router.refresh();
    } else {
      setError(result.error?.message ?? "Failed to save ingredients.");
    }
  }, [recipeId, rows, router]);

  const handleCancel = useCallback(() => {
    router.push(`/recipes/${recipeId}`);
    router.refresh();
  }, [recipeId, router]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
        <p className="text-center text-destructive" role="alert">
          {error}
        </p>
        <Link
          href={`/recipes/${recipeId}`}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to recipe
        </Link>
        <Link
          href={`/recipes/${recipeId}/edit`}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to edit
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <EnhancingIngredientsLoader size="large" />
        <div className="flex max-w-md flex-col gap-3 text-center">
          <h2 className="text-2xl font-medium text-foreground">
            Enhancing ingredients...
          </h2>
          {recipeTitle && (
            <p className="text-sm text-muted-foreground">{recipeTitle}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Parsing raw ingredient data for quantity, unit, and display text and
            mapping to your catalog of ingredients
          </p>
        </div>
      </div>
    );
  }

  const totalCount = rows.length;

  return (
    <div className="space-y-6">
      <Callout variant="info" className="w-full text-foreground">
        <p>
          <span className="font-medium text-info">
            {fullyEnhancedCount} of {totalCount} ingredients fully enhanced
          </span>
          . Review and edit the mappings below, then save or cancel.
        </p>
      </Callout>

      <Card>
        <CardContent>
          <SectionHeader variant="section" title="Ingredient mappings" />
          <div className="space-y-4">
            {rows.map((row, index) => {
              const needsQuantityOutline = !row.quantityText?.trim();
              const needsUnitOutline = row.unit == null;
              const needsPickerOutline = !row.ingredientId && !row.ingredientName;
              return (
                <div key={index}>
                  {row.rawText?.trim() && (
                    <p
                      className="mb-2 text-sm text-muted-foreground"
                      aria-label="Original ingredient line"
                    >
                      <span className="not-italic">Original:</span>{" "}
                      <span className="italic">{row.rawText}</span>
                    </p>
                  )}
                  <IngredientEditorRow
                    mode="edit"
                    compact
                    hideLabels
                    outlineQuantity={needsQuantityOutline}
                    outlineUnit={needsUnitOutline}
                    outlinePicker={needsPickerOutline}
                    displayText={row.displayText}
                    onDisplayTextChange={(v) =>
                      updateRow(index, { displayText: v })
                    }
                    quantityText={row.quantityText}
                    onQuantityTextChange={(v) =>
                      updateRow(index, { quantityText: v })
                    }
                    unit={row.unit}
                    onUnitChange={(v) => updateRow(index, { unit: v })}
                    catalog={catalog}
                    onSearchIngredients={handleSearchIngredients}
                    ingredientId={row.ingredientId}
                    onChangeIngredient={(id, name) =>
                      updateRow(index, { ingredientId: id, ingredientName: name })
                    }
                    selectedIngredientName={row.ingredientName}
                    placeholder="Search or type to create"
                    onSelectNew={async (name) => {
                      const formData = new FormData();
                      formData.set("name", name.trim());
                      formData.set("costBasisUnit", "GRAM");
                      const result = await createIngredientAction(
                        null,
                        formData
                      );
                      if (result.ok) {
                        const newItem = {
                          id: result.data.id,
                          name: name.trim(),
                        };
                        setCatalog((prev) => [newItem, ...prev]);
                        return newItem;
                      }
                      return null;
                    }}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saveLoading}
          aria-busy={saveLoading}
        >
          {saveLoading ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          onClick={handleCancel}
          disabled={saveLoading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
