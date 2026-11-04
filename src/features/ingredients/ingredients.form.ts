import type { Ingredient } from "@/db/schema/ingredients";
import { PURCHASE_UNITS, type IngredientDisplayUnit, type PurchaseUnit, type VolumeUnit } from "@/db/schema/enums";
import { formatQuantityForInput } from "@/lib/quantity/quantity";

export type IngredientFormValues = {
  name: string;
  category: string;
  purchasePrice: string;
  purchaseQuantity: string;
  purchaseUnit: PurchaseUnit;
  volumeAmount: string;
  volumeUnit: VolumeUnit;
  volumeWeightGrams: string;
  gramsPerEach: string;
  preferredDisplayUnit: IngredientDisplayUnit;
  notes: string;
  baseIngredientId: string;
};

export function ingredientFormValues(source: Partial<Ingredient> = {}): IngredientFormValues {
  const hasServing = source.volumeAmount != null && source.volumeUnit != null && source.volumeWeightGrams != null;
  return {
    name: source.name ?? "",
    category: source.category ?? "",
    purchasePrice: source.purchasePriceCents != null ? String(source.purchasePriceCents / 100) : "",
    purchaseQuantity: formatQuantityForInput(source.purchaseQuantity ?? null),
    purchaseUnit: source.purchaseUnit ?? (
      PURCHASE_UNITS.includes(source.costBasisUnit as PurchaseUnit) ? source.costBasisUnit as PurchaseUnit : "G"
    ),
    volumeAmount: hasServing ? String(source.volumeAmount) : "1",
    volumeUnit: hasServing ? source.volumeUnit! : "CUP",
    volumeWeightGrams: formatQuantityForInput(hasServing ? source.volumeWeightGrams! : source.gramsPerCup ?? null),
    gramsPerEach: formatQuantityForInput(source.gramsPerEach ?? null),
    preferredDisplayUnit: source.preferredDisplayUnit ?? "AUTO",
    notes: source.notes ?? "",
    baseIngredientId: source.baseIngredientId ?? "",
  };
}
