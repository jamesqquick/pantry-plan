import { describe, expect, it } from "vitest";
import { formatMaterialUnitCost, materialLineCost } from "./materials";
import { materialCreateSchema, orderMaterialsSchema } from "./materials.schemas";

const valid = {
  name: "Labels", category: "Labels & print", usageUnit: "each", packageQuantity: 500, packagePriceCents: 625,
};

describe("material pricing and validation", () => {
  it("keeps fractional-cent unit prices and rounds each usage line", () => {
    expect(formatMaterialUnitCost(625 / 500)).toBe("$0.0125");
    expect(materialLineCost(625 / 500, 24)).toBe(30);
    expect(materialLineCost(1200 / 30, 4.5)).toBe(180);
    expect(materialLineCost(100, 1.005)).toBe(101);
    expect(materialLineCost(1.25, 1) + materialLineCost(1.25, 1)).toBe(2);
    expect(materialLineCost(0, 0.5)).toBe(0);
    expect(materialLineCost(100_000_000 / 0.02, 1_000_000)).toBe(5_000_000_000_000_000);
    expect(materialLineCost(1_000_000_000_000_000.25, 1)).toBe(1_000_000_000_000_000);
  });

  it("accepts fractional count, area, length, weight, and a free package", () => {
    for (const usageUnit of ["each", "sq-ft", "ft", "oz"]) {
      expect(materialCreateSchema.parse({ ...valid, usageUnit, packagePriceCents: 0, packageQuantity: 0.5 })).toMatchObject({
        usageUnit, packageQuantity: 0.5, packagePriceCents: 0,
      });
    }
  });

  it.each([0, -1, NaN, Infinity, 1_000_001])("rejects invalid package and usage amounts of %s", (quantity) => {
    expect(materialCreateSchema.safeParse({ ...valid, packageQuantity: quantity }).success).toBe(false);
    expect(orderMaterialsSchema.safeParse([{ materialId: "labels", quantity }]).success).toBe(false);
  });

  it.each(["box", "sheet", "piece", "bag", "label", "cup"])("rejects the unsupported unit %s", (usageUnit) => {
    expect(materialCreateSchema.safeParse({ ...valid, usageUnit }).success).toBe(false);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "ftp://shop.example.com", "/relative", "not a url"])(
    "rejects the unsafe product URL %s", (productUrl) => {
      expect(materialCreateSchema.safeParse({ ...valid, productUrl }).success).toBe(false);
    },
  );

  it("trims optional details and allows product links to be cleared", () => {
    expect(materialCreateSchema.parse({ ...valid, productUrl: " https://shop.example.com/labels ", supplier: " Shop " })).toMatchObject({
      productUrl: "https://shop.example.com/labels", supplier: "Shop", notes: null,
    });
    expect(materialCreateSchema.parse({ ...valid, productUrl: " " }).productUrl).toBeNull();
  });

  it("rejects duplicate order materials and strips client-supplied prices", () => {
    const row = { materialId: "labels", quantity: 0.5, unitCostCents: 0, name: "Spoofed" };
    expect(orderMaterialsSchema.safeParse([row, row]).success).toBe(false);
    expect(orderMaterialsSchema.parse([row])).toEqual([{ materialId: "labels", quantity: 0.5 }]);
  });
});
