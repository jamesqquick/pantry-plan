export const UNITS = [
  "COUNT",
  "TSP",
  "TBSP",
  "CUP",
  "OZ",
  "LB",
  "G",
  "KG",
] as const;

export type Unit = (typeof UNITS)[number];

export const UNIT_FAMILIES: Record<Unit, "volume" | "weight" | "count"> = {
  COUNT: "count",
  TSP: "volume",
  TBSP: "volume",
  CUP: "volume",
  OZ: "weight",
  LB: "weight",
  G: "weight",
  KG: "weight",
};

/** Minimal conversions to a base within family (CUP-family volume only). */
export function toBaseAmount(amount: number, unit: Unit): { amount: number; base: string } {
  switch (unit) {
    case "KG":
      return { amount: amount * 1000, base: "G" };
    case "LB":
      return { amount: amount * 16, base: "OZ" };
    case "TBSP":
      return { amount: amount * 3, base: "TSP" };
    case "CUP":
      return { amount: amount * 48, base: "TSP" };
    default:
      return { amount, base: unit };
  }
}
