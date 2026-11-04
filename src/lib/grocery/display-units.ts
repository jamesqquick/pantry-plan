/**
 * Shopper-friendly display conversion from canonical totals.
 * Client-safe: no Prisma, auth, or env. Uses only plain types.
 * Cost is always computed from canonical (costBasisUnit); this is display-only.
 */
import { formatQuantity } from "@/lib/quantity/quantity";
import type { CostBasisUnit, IngredientDisplayUnit } from "@/db/schema/enums";
import { UNIT_LABELS } from "@/lib/ingredients/units";
import { convertToBasis } from "./canonical";

export type CanonicalUnit = "GRAM" | "CUP" | "EACH";
export type DisplayPreference = IngredientDisplayUnit;

export type IngredientDisplayInfo = {
  preferredDisplayUnit: DisplayPreference;
  gramsPerCup?: number | null;
  gramsPerEach?: number | null;
  cupsPerEach?: number | null;
  purchaseUnit?: CostBasisUnit | null;
};

export type DisplayResult = {
  displayQty: number;
  displayUnitLabel: string;
  displayText: string;
};

const TSP_PER_CUP = 48;
const TBSP_PER_CUP = 16;

/** tsp -> cups: qty / 48; tbsp -> cups: qty / 16; cups -> cups: qty */
export function cupsFromTspTbsp(
  qty: number,
  unit: "TSP" | "TBSP" | "CUP"
): number {
  if (unit === "CUP") return qty;
  if (unit === "TBSP") return qty / TBSP_PER_CUP;
  return qty / TSP_PER_CUP;
}

/** cups -> tsp: qty * 48 */
export function tspFromCups(cups: number): number {
  return cups * TSP_PER_CUP;
}

/** cups -> tbsp: qty * 16 */
export function tbspFromCups(cups: number): number {
  return cups * TBSP_PER_CUP;
}

export function cupsToGrams(cups: number, gramsPerCup: number): number {
  return cups * gramsPerCup;
}

export function gramsToCups(grams: number, gramsPerCup: number): number {
  return grams / gramsPerCup;
}

/** Round to nearest 1/4 cup for cup display when qty >= 1 */
function roundQuarterCup(qty: number): number {
  return Math.round(qty * 4) / 4;
}

/** Round to nearest 1/4 tsp */
function roundQuarterTsp(qty: number): number {
  return Math.round(qty * 4) / 4;
}

/** Round to nearest 1/2 tbsp */
function roundHalfTbsp(qty: number): number {
  return Math.round(qty * 2) / 2;
}

/** Round grams: nearest 1g, or nearest 5g if > 500 */
function roundGrams(qty: number): number {
  if (qty > 500) return Math.round(qty / 5) * 5;
  return Math.round(qty);
}

/** Round each: whole if within 0.01, else 1 decimal */
function roundEach(qty: number): number {
  if (Math.abs(qty - Math.round(qty)) < 0.01) return Math.round(qty);
  return Math.round(qty * 10) / 10;
}

/** Human-friendly quantity string (fractions for decimals, e.g. 0.5 → "1/2") */
export function formatDisplayQty(qty: number): string {
  return formatQuantity(qty);
}

/** Short label from convertToBasis / COST_BASIS_SHORT_LABELS (g, kg, tsp, ea, …). */
export type CanonicalUnitLabel = string;

export function formatCanonicalForKitchen(
  totalBasisQty: number,
  basisUnitLabel: CanonicalUnitLabel
): string {
  if (basisUnitLabel === "ea") {
    const qty =
      Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6
        ? Math.round(totalBasisQty)
        : Math.round(totalBasisQty * 10) / 10;
    return formatDisplayQty(qty);
  }
  let qty: number;
  if (basisUnitLabel === "g") {
    qty =
      totalBasisQty > 500
        ? Math.round(totalBasisQty / 5) * 5
        : Math.round(totalBasisQty);
  } else if (basisUnitLabel === "cup") {
    qty =
      totalBasisQty >= 1 &&
      Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6
        ? Math.round(totalBasisQty)
        : Math.round(totalBasisQty * 100) / 100;
  } else {
    qty =
      Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-2
        ? Math.round(totalBasisQty * 100) / 100
        : Math.round(totalBasisQty * 1000) / 1000;
  }
  return `${formatDisplayQty(qty)} ${basisUnitLabel}`;
}

/**
 * Convert canonical total to shopper-friendly display using ingredient preferences.
 * Fall back to the purchase unit, then canonical, when conversion is unavailable.
 */
export function toDisplayUnits(params: {
  canonicalQty: number;
  canonicalUnit: CanonicalUnit;
  ingredient: IngredientDisplayInfo;
}): DisplayResult {
  const { canonicalQty, canonicalUnit, ingredient } = params;
  const canonicalBasis = { GRAM: "G", CUP: "CUP", EACH: "COUNT" } as const;
  const displayBasis: Record<Exclude<DisplayPreference, "AUTO">, CostBasisUnit> = {
    GRAM: "G", KG: "KG", OZ: "OZ", LB: "LB", CUP: "CUP", EACH: "COUNT", TBSP: "TBSP", TSP: "TSP",
  };
  const positive = (value: number | null | undefined) => value != null && Number.isFinite(value) && value > 0 ? value : null;
  const conversion = {
    gramsPerCup: positive(ingredient.gramsPerCup),
    gramsPerEach: positive(ingredient.gramsPerEach),
    cupsPerEach: positive(ingredient.cupsPerEach),
  };
  const purchaseBasis = ingredient.purchaseUnit ?? canonicalBasis[canonicalUnit];
  const automaticBasis = conversion.gramsPerEach != null || conversion.cupsPerEach != null ? "COUNT" : purchaseBasis;
  let basis = ingredient.preferredDisplayUnit === "AUTO" ? automaticBasis : displayBasis[ingredient.preferredDisplayUnit];
  const convert = (basisUnit: CostBasisUnit) => convertToBasis({
    quantity: canonicalQty, unit: canonicalBasis[canonicalUnit], basisUnit, ingredientConversion: conversion,
  })?.basisQty;
  let quantity = convert(basis);
  if (quantity == null || !Number.isFinite(quantity)) {
    basis = purchaseBasis;
    quantity = convert(basis);
  }
  if (quantity == null || !Number.isFinite(quantity)) {
    basis = canonicalBasis[canonicalUnit];
    quantity = canonicalQty;
  }

  let rounded = basis === "G" ? roundGrams(quantity)
    : basis === "COUNT" ? roundEach(quantity)
      : basis === "CUP" ? quantity >= 1 ? roundQuarterCup(quantity) : quantity
        : basis === "TSP" ? roundQuarterTsp(quantity)
          : basis === "TBSP" ? roundHalfTbsp(quantity)
            : Number(quantity.toPrecision(4));
  if (rounded === 0 && quantity > 0) rounded = quantity;
  const decimalText = rounded.toLocaleString("en-US", { maximumSignificantDigits: 4, useGrouping: false });
  const fractionText = formatDisplayQty(rounded);
  const text = basis === "KG" || basis === "LB" || basis === "OZ" || (rounded > 0 && fractionText === "0") ? decimalText : fractionText;
  const label = UNIT_LABELS[basis];
  return { displayQty: rounded, displayUnitLabel: label, displayText: `${text} ${label}` };
}
