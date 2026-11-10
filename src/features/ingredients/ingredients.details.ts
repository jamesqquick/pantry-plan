import type { Ingredient } from "@/db/schema/ingredients";
import { formatIngredientCost } from "@/lib/ingredients/pricing";
import { DISPLAY_UNIT_LABELS, UNIT_LABELS } from "@/lib/ingredients/units";
import { formatQuantity } from "@/lib/quantity/quantity";

export type IngredientDetail = { label: string; value: string };

function formatPurchaseAmount(source: Partial<Ingredient>) {
  const quantity = source.purchaseQuantity ?? null;
  const unit = source.purchaseUnit ?? null;
  if (quantity == null && unit == null) return "Not provided";
  if (quantity != null && unit != null) return `${formatQuantity(quantity)} ${UNIT_LABELS[unit]}`;

  const parts = [
    quantity != null ? formatQuantity(quantity) : "amount not provided",
    unit != null ? UNIT_LABELS[unit] : "unit not provided",
  ];
  return parts.join(" — ");
}

function formatVolumeReference(source: Partial<Ingredient>) {
  const amount = source.volumeAmount ?? null;
  const unit = source.volumeUnit ?? null;
  if (amount == null && unit == null) return "Not provided";
  if (amount != null && unit != null) return `${formatQuantity(amount)} ${UNIT_LABELS[unit]}`;

  return [
    amount != null ? formatQuantity(amount) : "amount not provided",
    unit != null ? UNIT_LABELS[unit] : "unit not provided",
  ].join(" — ");
}

export function buildIngredientDetails(source: Partial<Ingredient>): IngredientDetail[] {
  const details: IngredientDetail[] = [];

  if (source.category) details.push({ label: "Category", value: source.category });
  if (source.preferredDisplayUnit && source.preferredDisplayUnit !== "AUTO") {
    details.push({ label: "Grocery list unit", value: DISPLAY_UNIT_LABELS[source.preferredDisplayUnit] ?? source.preferredDisplayUnit });
  }

  const purchasePriceCents = source.purchasePriceCents ?? null;
  const purchaseQuantity = source.purchaseQuantity ?? null;
  const purchaseUnit = source.purchaseUnit ?? null;
  const hasPurchaseDetails = purchasePriceCents != null || purchaseQuantity != null || purchaseUnit != null;
  const hasCompletePurchase = purchasePriceCents != null && purchaseQuantity != null && purchaseUnit != null;

  if (hasCompletePurchase) {
    details.push({
      label: "Cost",
      value: `${formatIngredientCost(purchasePriceCents)} for ${formatQuantity(purchaseQuantity)} ${UNIT_LABELS[purchaseUnit]}`,
    });
  } else if (hasPurchaseDetails) {
    details.push({
      label: "Purchase price",
      value: purchasePriceCents != null ? formatIngredientCost(purchasePriceCents) : "Not provided",
    });
    details.push({ label: "Purchase amount", value: formatPurchaseAmount(source) });
  }

  if (!hasCompletePurchase && source.estimatedCentsPerBasisUnit != null && source.costBasisUnit != null) {
    const basisLabel = UNIT_LABELS[source.costBasisUnit] ?? source.costBasisUnit;
    details.push({
      label: "Estimated cost",
      value: `${formatIngredientCost(source.estimatedCentsPerBasisUnit)} per ${basisLabel}`,
    });
  }

  const volumeAmount = source.volumeAmount ?? null;
  const volumeUnit = source.volumeUnit ?? null;
  const volumeWeightGrams = source.volumeWeightGrams ?? null;
  const hasVolumeDetails = volumeAmount != null || volumeUnit != null || volumeWeightGrams != null;
  const hasCompleteVolume = volumeAmount != null && volumeUnit != null && volumeWeightGrams != null;

  if (hasVolumeDetails) {
    details.push({ label: "Volume reference", value: formatVolumeReference(source) });
    if (hasCompleteVolume) {
      details.push({
        label: "Volume to weight",
        value: `${formatVolumeReference(source)} = ${formatQuantity(volumeWeightGrams)} g`,
      });
    } else if (source.gramsPerCup != null) {
      details.push({ label: "Volume to weight", value: `1 cup = ${formatQuantity(source.gramsPerCup)} g` });
    } else {
      const missing = [
        volumeAmount == null ? "volume amount" : null,
        volumeUnit == null ? "volume unit" : null,
        volumeWeightGrams == null ? "weight" : null,
      ].filter((value): value is string => value != null);
      const guidance = missing.length === 1 && missing[0] === "weight"
        ? "Add a weight for this volume to calculate a conversion."
        : `Add ${missing.join(" and ")} to calculate a volume conversion.`;
      details.push({ label: "Volume conversion", value: guidance });
    }
  } else if (source.gramsPerCup != null) {
    details.push({ label: "Volume to weight", value: `1 cup = ${formatQuantity(source.gramsPerCup)} g` });
  }

  if (source.gramsPerEach != null) {
    details.push({ label: "Weight per item", value: `${formatQuantity(source.gramsPerEach)} g` });
  }

  return details;
}
