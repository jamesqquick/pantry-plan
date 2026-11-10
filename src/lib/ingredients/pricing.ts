import type { PurchaseUnit, VolumeUnit } from "@/db/schema/enums";
import { lineVolumeToCups } from "@/lib/grocery/canonical";
import { dollarsToCents } from "@/lib/money";

export type IngredientPricingInput = {
  purchasePrice?: number | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: PurchaseUnit | null;
  volumeAmount?: number | null;
  volumeUnit?: VolumeUnit | null;
  volumeWeightGrams?: number | null;
  gramsPerEach?: number | null;
};

export function deriveIngredientPricing(input: IngredientPricingInput) {
  const purchasePrice = input.purchasePrice ?? null;
  const purchaseQuantity = input.purchaseQuantity ?? null;
  const purchaseUnit = input.purchaseUnit ?? null;
  const volumeAmount = input.volumeAmount ?? null;
  const volumeUnit = input.volumeUnit ?? null;
  const volumeWeightGrams = input.volumeWeightGrams ?? null;
  const purchasePriceCents = purchasePrice == null ? null : dollarsToCents(purchasePrice);
  const hasPurchaseRate = purchasePriceCents != null && purchaseQuantity != null && purchaseQuantity > 0 && purchaseUnit != null;
  const volumeCups = volumeAmount != null && volumeAmount > 0 && volumeUnit != null
    ? lineVolumeToCups(volumeAmount, volumeUnit)
    : null;

  return {
    purchasePriceCents,
    purchaseQuantity,
    purchaseUnit,
    costBasisUnit: purchaseUnit ?? "G",
    estimatedCentsPerBasisUnit: hasPurchaseRate ? purchasePriceCents / purchaseQuantity : null,
    volumeAmount,
    volumeUnit,
    volumeWeightGrams,
    gramsPerCup: volumeCups != null && volumeWeightGrams != null ? volumeWeightGrams / volumeCups : null,
    gramsPerEach: input.gramsPerEach ?? null,
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
