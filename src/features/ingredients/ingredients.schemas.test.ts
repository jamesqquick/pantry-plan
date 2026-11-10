import { describe, expect, it } from "vitest";
import { ingredientCreateSchema, ingredientUpdateSchema } from "./ingredients.schemas";

const base = {
  name: "eggs",
  purchasePrice: "4",
  purchaseQuantity: "12",
  purchaseUnit: "COUNT",
  volumeAmount: "1",
  volumeUnit: "CUP",
  volumeWeightGrams: "240",
};

describe("ingredient pricing and measurements", () => {
  it("accepts package pricing and a measured serving size", () => {
    const result = ingredientCreateSchema.parse({
      ...base,
      volumeAmount: "0.25",
      volumeWeightGrams: "30",
      preferredDisplayUnit: "LB",
    });

    expect(result).toMatchObject({
      purchasePrice: 4,
      purchaseQuantity: 12,
      purchaseUnit: "COUNT",
      volumeAmount: 0.25,
      volumeUnit: "CUP",
      volumeWeightGrams: 30,
      preferredDisplayUnit: "LB",
    });
  });

  it("accepts name-only create and update without inventing optional values", () => {
    const create = ingredientCreateSchema.parse({ name: "Eggs" });
    const update = ingredientUpdateSchema.parse({ id: "eggs", name: "Eggs" });

    expect(create.name).toBe("Eggs");
    expect(create.purchasePrice).toBeUndefined();
    expect(create.volumeAmount).toBeUndefined();
    expect(update.purchaseQuantity).toBeUndefined();
    expect(update.volumeWeightGrams).toBeUndefined();
    expect(create.preferredDisplayUnit).toBe("AUTO");
    expect(update.preferredDisplayUnit).toBeUndefined();
  });

  it.each([
    { details: { purchasePrice: "4" }, missing: ["purchaseQuantity", "purchaseUnit"] },
    { details: { purchaseQuantity: "12" }, missing: ["purchasePrice", "purchaseUnit"] },
    { details: { purchaseUnit: "COUNT" }, missing: ["purchasePrice", "purchaseQuantity"] },
    { details: { volumeAmount: "0.25" }, missing: ["volumeUnit", "volumeWeightGrams"] },
    { details: { volumeUnit: "CUP" }, missing: ["volumeAmount", "volumeWeightGrams"] },
    { details: { volumeWeightGrams: "30" }, missing: ["volumeAmount", "volumeUnit"] },
  ])("rejects incomplete measurement groups: $details", ({ details, missing }) => {
    const result = ingredientCreateSchema.safeParse({ name: "Eggs", ...details });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(missing);
      const message = missing[0]!.startsWith("purchase")
        ? "To estimate cost, enter the price, amount bought, and unit together. Leave all three blank to skip cost details."
        : "To convert volume to weight, enter the volume amount, unit, and weight in grams together. Leave all three blank to skip this conversion.";
      expect(result.error.issues.every((issue) => issue.message === message)).toBe(true);
    }
  });

  it("keeps item weight independently optional", () => {
    expect(ingredientCreateSchema.safeParse({ name: "Eggs", gramsPerEach: "50" }).success).toBe(true);
  });

  it("accepts sparse update fields for merged server-side validation", () => {
    const update = ingredientUpdateSchema.parse({ id: "eggs", name: "Eggs", purchasePrice: "5" });

    expect(update.purchasePrice).toBe(5);
    expect(update.purchaseQuantity).toBeUndefined();
    expect(update.purchaseUnit).toBeUndefined();
  });

  it("distinguishes omitted update fields from explicit clearing", () => {
    const omitted = ingredientUpdateSchema.parse({ id: "eggs", name: "Eggs" });
    expect(omitted.purchasePrice).toBeUndefined();
    expect(omitted.purchaseQuantity).toBeUndefined();
    expect(omitted.purchaseUnit).toBeUndefined();
    expect(omitted.volumeAmount).toBeUndefined();
    expect(omitted.volumeUnit).toBeUndefined();
    expect(omitted.volumeWeightGrams).toBeUndefined();
    expect(omitted.gramsPerEach).toBeUndefined();

    const cleared = ingredientUpdateSchema.parse({
      id: "eggs",
      name: "Eggs",
      purchasePrice: "",
      purchaseQuantity: "",
      purchaseUnit: "",
      volumeAmount: "",
      volumeUnit: "",
      volumeWeightGrams: "",
      gramsPerEach: "",
      preferredDisplayUnit: "",
    });
    expect(cleared.purchasePrice).toBeNull();
    expect(cleared.purchaseQuantity).toBeNull();
    expect(cleared.purchaseUnit).toBeNull();
    expect(cleared.volumeAmount).toBeNull();
    expect(cleared.volumeUnit).toBeNull();
    expect(cleared.volumeWeightGrams).toBeNull();
    expect(cleared.gramsPerEach).toBeNull();
    expect(cleared.preferredDisplayUnit).toBe("AUTO");
  });

  it("treats blank optional values on create as unknown", () => {
    const result = ingredientCreateSchema.parse({
      name: "Eggs",
      purchasePrice: "",
      purchaseQuantity: "",
      purchaseUnit: "",
      volumeAmount: "",
      volumeUnit: "",
      volumeWeightGrams: "",
      gramsPerEach: "",
    });

    expect(result.purchasePrice).toBeNull();
    expect(result.purchaseQuantity).toBeNull();
    expect(result.purchaseUnit).toBeNull();
    expect(result.volumeAmount).toBeNull();
    expect(result.volumeUnit).toBeNull();
    expect(result.volumeWeightGrams).toBeNull();
    expect(result.gramsPerEach).toBeNull();
  });

  it.each([
    ["purchasePrice", "-1"],
    ["purchasePrice", "Infinity"],
    ["purchasePrice", "NaN"],
    ["purchaseQuantity", "0"],
    ["purchaseQuantity", "-1"],
    ["purchaseQuantity", "Infinity"],
    ["volumeAmount", "0"],
    ["volumeAmount", "-1"],
    ["volumeAmount", "Infinity"],
    ["volumeWeightGrams", "0"],
    ["volumeWeightGrams", "-1"],
    ["volumeWeightGrams", "Infinity"],
    ["gramsPerEach", "0"],
    ["gramsPerEach", "-1"],
    ["gramsPerEach", "Infinity"],
  ])("rejects an invalid supplied optional value (%s: %s)", (field, value) => {
    const result = ingredientCreateSchema.safeParse({ name: "Eggs", [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
    }
  });

  it.each([0, "0", "0.00"])("accepts explicit zero price %s on create and update", (purchasePrice) => {
    const values = { ...base, purchasePrice };
    expect(ingredientCreateSchema.parse(values).purchasePrice).toBe(0);
    expect(ingredientUpdateSchema.parse({ ...values, id: "water" }).purchasePrice).toBe(0);
  });

  it("rejects invalid or negative prices rather than coercing them to free", () => {
    for (const purchasePrice of [-1, "-1", "not-a-number", "Infinity", Infinity, NaN, false, true, [], [0], {}]) {
      const values = { ...base, purchasePrice };
      expect(ingredientCreateSchema.safeParse(values).success).toBe(false);
      expect(ingredientUpdateSchema.safeParse({ ...values, id: "water" }).success).toBe(false);
    }
  });

  it("accepts positive prices that round to zero cents on create and update", () => {
    const values = { ...base, purchasePrice: "0.001" };
    expect(ingredientCreateSchema.parse(values).purchasePrice).toBe(0.001);
    expect(ingredientUpdateSchema.parse({ ...values, id: "water" }).purchasePrice).toBe(0.001);
  });

  it.each(["purchaseQuantity", "volumeAmount", "volumeWeightGrams"])(
    "rejects nonpositive or nonfinite supplied %s on create and update",
    (field) => {
      for (const value of ["0", "-1", "not-a-number", "Infinity", Infinity, NaN]) {
        const values = { ...base, [field]: value };
        expect(ingredientCreateSchema.safeParse(values).success).toBe(false);
        expect(ingredientUpdateSchema.safeParse({ ...values, id: "eggs" }).success).toBe(false);
      }
    },
  );

  it("rejects whitespace-only names", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });

  it("rejects unsupported purchase and volume units", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, purchaseUnit: "PINCH" }).success).toBe(false);
    expect(ingredientCreateSchema.safeParse({ ...base, volumeUnit: "G" }).success).toBe(false);
  });

  it("accepts a positive decimal", () => {
    const result = ingredientCreateSchema.parse({ ...base, gramsPerEach: "50.5" });

    expect(result.gramsPerEach).toBe(50.5);
  });

  it("reports invalid supplied volume weights on the weight field", () => {
    const result = ingredientCreateSchema.safeParse({
      name: "Flour",
      volumeAmount: "1",
      volumeUnit: "CUP",
      volumeWeightGrams: "0",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([["volumeWeightGrams"]]);
    }
  });

  it("reports an invalid supplied volume field before missing companions", () => {
    const result = ingredientCreateSchema.safeParse({ name: "Flour", volumeWeightGrams: "0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([["volumeWeightGrams"]]);
    }
  });

  it("leaves missing item weight unknown", () => {
    expect(ingredientCreateSchema.parse(base).gramsPerEach).toBeUndefined();
  });

  it.each([null, "", "  "])("allows blank item weight: %s", (gramsPerEach) => {
    expect(ingredientCreateSchema.parse({ ...base, gramsPerEach }).gramsPerEach).toBeNull();
  });

  it.each(["0", "-1", "not-a-number", "Infinity"])("rejects item weight %s", (value) => {
    expect(() => ingredientCreateSchema.parse({ ...base, gramsPerEach: value })).toThrow();
  });

  it("rejects inputs whose derived conversion or rate overflows", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, purchaseQuantity: "1e-320" }).success).toBe(false);
    expect(ingredientCreateSchema.safeParse({ ...base, volumeAmount: "1e-320" }).success).toBe(false);
  });
});
