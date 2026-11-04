import type { PurchaseUnit, VolumeUnit } from "@/db/schema/enums";
import { lineVolumeToCups } from "@/lib/grocery/canonical";
import { dollarsToCents } from "@/lib/money";

export type IngredientPricingInput = {
  purchasePrice: number;
  purchaseQuantity: number;
  purchaseUnit: PurchaseUnit;
  volumeAmount: number;
  volumeUnit: VolumeUnit;
  volumeWeightGrams: number;
};

export function deriveIngredientPricing(input: IngredientPricingInput) {
  const purchasePriceCents = dollarsToCents(input.purchasePrice);
  return {
    purchasePriceCents,
    purchaseQuantity: input.purchaseQuantity,
    purchaseUnit: input.purchaseUnit,
    costBasisUnit: input.purchaseUnit,
    estimatedCentsPerBasisUnit: purchasePriceCents / input.purchaseQuantity,
    volumeAmount: input.volumeAmount,
    volumeUnit: input.volumeUnit,
    volumeWeightGrams: input.volumeWeightGrams,
    gramsPerCup: input.volumeWeightGrams / lineVolumeToCups(input.volumeAmount, input.volumeUnit)!,
  };
}

export function formatIngredientCost(cents: number): string {
  const dollars = cents / 100;
  if (dollars > 0 && dollars < 0.0001) return "less than $0.0001";
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: dollars < 0.01 ? 4 : 2,
  });
}
