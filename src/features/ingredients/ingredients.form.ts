import type { Ingredient } from "@/db/schema/ingredients";
import type { IngredientDisplayUnit, PurchaseUnit, VolumeUnit } from "@/db/schema/enums";
import { formatQuantityForInput } from "@/lib/quantity/quantity";

export type IngredientFormValues = {
  name: string;
  category: string;
  purchasePrice: string;
  purchaseQuantity: string;
  purchaseUnit: PurchaseUnit | "";
  volumeAmount: string;
  volumeUnit: VolumeUnit | "";
  volumeWeightGrams: string;
  gramsPerEach: string;
  preferredDisplayUnit: IngredientDisplayUnit;
  notes: string;
  baseIngredientId: string;
};

export function ingredientFormValues(source: Partial<Ingredient> = {}): IngredientFormValues {
  const hasVolumeInput = source.volumeAmount != null || source.volumeUnit != null || source.volumeWeightGrams != null;
  const legacyDensity = !hasVolumeInput && source.gramsPerCup != null ? source.gramsPerCup : null;
  return {
    name: source.name ?? "",
    category: source.category ?? "",
    purchasePrice: source.purchasePriceCents != null ? String(source.purchasePriceCents / 100) : "",
    purchaseQuantity: formatQuantityForInput(source.purchaseQuantity ?? null),
    purchaseUnit: source.purchaseUnit ?? "",
    volumeAmount: source.volumeAmount != null ? String(source.volumeAmount) : legacyDensity != null ? "1" : "",
    volumeUnit: source.volumeUnit ?? (legacyDensity != null ? "CUP" : ""),
    volumeWeightGrams: formatQuantityForInput(source.volumeWeightGrams ?? legacyDensity),
    gramsPerEach: formatQuantityForInput(source.gramsPerEach ?? null),
    preferredDisplayUnit: source.preferredDisplayUnit ?? "AUTO",
    notes: source.notes ?? "",
    baseIngredientId: source.baseIngredientId ?? "",
  };
}
