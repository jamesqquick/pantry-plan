import type { Material } from "@/db/schema/materials";

export const MATERIAL_CATEGORIES = [
  "Boxes & containers", "Boards & supports", "Bags", "Wrapping & liners",
  "Labels & print", "Finishing supplies", "Delivery & shipping", "Production disposables",
] as const;

export const MATERIAL_UNITS = [
  "each", "in", "ft", "yd", "cm", "m", "sq-ft", "sq-m", "oz", "lb", "g", "kg",
] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export const MATERIAL_UNIT_GROUPS: { label: string; units: readonly MaterialUnit[] }[] = [
  { label: "Count", units: ["each"] },
  { label: "Length", units: ["in", "ft", "yd", "cm", "m"] },
  { label: "Area", units: ["sq-ft", "sq-m"] },
  { label: "Weight", units: ["oz", "lb", "g", "kg"] },
];

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  each: "Number of items", in: "Inches", ft: "Feet", yd: "Yards", cm: "Centimeters", m: "Meters",
  "sq-ft": "Square feet", "sq-m": "Square meters", oz: "Ounces", lb: "Pounds", g: "Grams", kg: "Kilograms",
};

export type MaterialOption = Pick<Material,
  "id" | "name" | "category" | "usageUnit" | "packageQuantity" | "packagePriceCents" | "supplier" | "productUrl"
>;

export type MaterialUsage = {
  materialId: string;
  name: string;
  usageUnit: MaterialUnit;
  unitCostCents: number;
  quantity: string;
  supplier: string | null;
  productUrl: string | null;
};

export function materialToUsage(material: MaterialOption): MaterialUsage {
  return {
    materialId: material.id, name: material.name, usageUnit: material.usageUnit,
    unitCostCents: materialUnitCost(material), quantity: "1",
    supplier: material.supplier, productUrl: material.productUrl,
  };
}

export function materialUnitCost(material: Pick<MaterialOption, "packagePriceCents" | "packageQuantity">): number {
  return material.packagePriceCents / material.packageQuantity;
}

export function materialLineCost(unitCostCents: number, quantity: number): number {
  const cost = unitCostCents * quantity;
  return Math.round(cost + Math.min(Number.EPSILON * Math.abs(cost), 1e-7));
}

export function formatMaterialUnit(unit: MaterialUnit, quantity = 1): string {
  return unit === "each" ? quantity === 1 ? "item" : "items" : unit;
}

export function formatMaterialUnitCost(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
  }).format(cents / 100);
}
