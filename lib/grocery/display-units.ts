/**
 * Shopper-friendly display conversion from canonical totals.
 * Client-safe: no Prisma, auth, or env. Uses only plain types.
 * Cost is always computed from canonical (costBasisUnit); this is display-only.
 */
import { formatQuantity } from "@/lib/quantity/quantity";

export type CanonicalUnit = "GRAM" | "CUP" | "EACH";
export type DisplayPreference =
  | "AUTO"
  | "GRAM"
  | "CUP"
  | "EACH"
  | "TBSP"
  | "TSP";

export type IngredientDisplayInfo = {
  preferredDisplayUnit: DisplayPreference;
  gramsPerCup?: number | null;
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

/** Kitchen mode: format canonical quantity + unit label (client-safe, no Prisma). */
export type CanonicalUnitLabel = "g" | "cup" | "ea";

export function formatCanonicalForKitchen(
  totalBasisQty: number,
  basisUnitLabel: CanonicalUnitLabel
): string {
  let qty: number;
  if (basisUnitLabel === "ea") {
    qty =
      Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6
        ? Math.round(totalBasisQty)
        : Math.round(totalBasisQty * 10) / 10;
  } else if (basisUnitLabel === "g") {
    qty =
      totalBasisQty > 500
        ? Math.round(totalBasisQty / 5) * 5
        : Math.round(totalBasisQty);
  } else {
    qty =
      totalBasisQty >= 1 &&
      Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6
        ? Math.round(totalBasisQty)
        : Math.round(totalBasisQty * 100) / 100;
  }
  // EACH: show quantity only (no "ea" on grocery list); other basis units keep label
  if (basisUnitLabel === "ea") return formatDisplayQty(qty);
  const label = basisUnitLabel === "g" ? "g" : "cup";
  return `${formatDisplayQty(qty)} ${label}`;
}

/**
 * Convert canonical total to shopper-friendly display using ingredient preferences.
 * Fallback to canonical when conversion not possible.
 */
export function toDisplayUnits(params: {
  canonicalQty: number;
  canonicalUnit: CanonicalUnit;
  ingredient: IngredientDisplayInfo;
}): DisplayResult {
  const { canonicalQty, canonicalUnit, ingredient } = params;
  const pref = ingredient.preferredDisplayUnit;
  const gramsPerCup = ingredient.gramsPerCup ?? null;

  const fallbackCanonical = (): DisplayResult => {
    const label =
      canonicalUnit === "GRAM"
        ? "g"
        : canonicalUnit === "CUP"
          ? "cup"
          : "ea";
    const rounded =
      canonicalUnit === "EACH"
        ? roundEach(canonicalQty)
        : canonicalUnit === "GRAM"
          ? roundGrams(canonicalQty)
          : canonicalUnit === "CUP"
            ? roundQuarterCup(canonicalQty)
            : canonicalQty;
    return {
      displayQty: rounded,
      displayUnitLabel: label,
      displayText: `${formatDisplayQty(rounded)} ${label}`,
    };
  };

  // EACH canonical → show quantity only (no "ea" on grocery list)
  if (canonicalUnit === "EACH") {
    const qty = roundEach(canonicalQty);
    return {
      displayQty: qty,
      displayUnitLabel: "ea",
      displayText: formatDisplayQty(qty),
    };
  }

  // CUP canonical
  if (canonicalUnit === "CUP") {
    const cups = canonicalQty;
    if (pref === "GRAM" && gramsPerCup != null) {
      const g = cupsToGrams(cups, gramsPerCup);
      const rounded = roundGrams(g);
      return {
        displayQty: rounded,
        displayUnitLabel: "g",
        displayText: `${formatDisplayQty(rounded)} g`,
      };
    }
    if (pref === "TBSP" || (pref === "AUTO" && cups < 1 / 16)) {
      const tsp = tspFromCups(cups);
      const rounded = roundQuarterTsp(tsp);
      return {
        displayQty: rounded,
        displayUnitLabel: "tsp",
        displayText: `${formatDisplayQty(rounded)} tsp`,
      };
    }
    if (pref === "TSP" || (pref === "AUTO" && cups < 1 / 4 && cups >= 1 / 16)) {
      const tbsp = tbspFromCups(cups);
      const rounded = roundHalfTbsp(tbsp);
      return {
        displayQty: rounded,
        displayUnitLabel: "tbsp",
        displayText: `${formatDisplayQty(rounded)} tbsp`,
      };
    }
    // CUP or AUTO with cups >= 1/4
    const rounded = cups >= 1 ? roundQuarterCup(cups) : cups;
    return {
      displayQty: rounded,
      displayUnitLabel: "cup",
      displayText: `${formatDisplayQty(rounded)} cup`,
    };
  }

  // GRAM canonical
  if (canonicalUnit === "GRAM") {
    const grams = canonicalQty;
    if (pref === "CUP" && gramsPerCup != null && grams >= 60) {
      const cups = gramsToCups(grams, gramsPerCup);
      const rounded = cups >= 1 ? roundQuarterCup(cups) : cups;
      return {
        displayQty: rounded,
        displayUnitLabel: "cup",
        displayText: `${formatDisplayQty(rounded)} cup`,
      };
    }
    if (pref === "TBSP" && gramsPerCup != null) {
      const cups = gramsToCups(grams, gramsPerCup);
      const tbsp = tbspFromCups(cups);
      const rounded = roundHalfTbsp(tbsp);
      return {
        displayQty: rounded,
        displayUnitLabel: "tbsp",
        displayText: `${formatDisplayQty(rounded)} tbsp`,
      };
    }
    if (pref === "TSP" && gramsPerCup != null) {
      const cups = gramsToCups(grams, gramsPerCup);
      const tsp = tspFromCups(cups);
      const rounded = roundQuarterTsp(tsp);
      return {
        displayQty: rounded,
        displayUnitLabel: "tsp",
        displayText: `${formatDisplayQty(rounded)} tsp`,
      };
    }
    if (pref === "GRAM" || pref === "AUTO") {
      const rounded = roundGrams(grams);
      return {
        displayQty: rounded,
        displayUnitLabel: "g",
        displayText: `${formatDisplayQty(rounded)} g`,
      };
    }
    if ((pref === "CUP" || pref === "TBSP" || pref === "TSP") && gramsPerCup != null) {
      const cups = gramsToCups(grams, gramsPerCup);
      if (pref === "TBSP") {
        const tbsp = tbspFromCups(cups);
        return {
          displayQty: roundHalfTbsp(tbsp),
          displayUnitLabel: "tbsp",
          displayText: `${formatDisplayQty(roundHalfTbsp(tbsp))} tbsp`,
        };
      }
      if (pref === "TSP") {
        const tsp = tspFromCups(cups);
        return {
          displayQty: roundQuarterTsp(tsp),
          displayUnitLabel: "tsp",
          displayText: `${formatDisplayQty(roundQuarterTsp(tsp))} tsp`,
        };
      }
      const rounded = cups >= 1 ? roundQuarterCup(cups) : cups;
      return {
        displayQty: rounded,
        displayUnitLabel: "cup",
        displayText: `${formatDisplayQty(rounded)} cup`,
      };
    }
  }

  return fallbackCanonical();
}
