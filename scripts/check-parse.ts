/**
 * Sanity check for ingredient line parsing (fractions, mixed numbers, unicode).
 * Run: npx tsx scripts/check-parse.ts
 */

import { parseIngredientLine } from "../lib/ingredients/parse-ingredient-line";
import { parseQuantityText, normalizeFractionText } from "../lib/ingredients/fractions";

const cases: Array<{ line: string; expectQty: number | null; expectUnit: string | null; expectName: string }> = [
  { line: "1/3 cup sugar", expectQty: 1 / 3, expectUnit: "CUP", expectName: "sugar" },
  { line: "1 1/2 cups flour", expectQty: 1.5, expectUnit: "CUP", expectName: "flour" },
  { line: "½ tsp salt", expectQty: 0.5, expectUnit: "TSP", expectName: "salt" },
  { line: "2.25 tbsp vanilla", expectQty: 2.25, expectUnit: "TBSP", expectName: "vanilla" },
  { line: "1/0 cup sugar", expectQty: null, expectUnit: "CUP", expectName: "sugar" },
];

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

console.log("normalizeFractionText samples:");
console.log(" ½ ->", normalizeFractionText("½"));
console.log(" 1-1/2 ->", normalizeFractionText("1-1/2"));

console.log("\nparseQuantityText samples:");
console.log(" 1/3 ->", parseQuantityText("1/3"));
console.log(" 1 1/2 ->", parseQuantityText("1 1/2"));
console.log(" 1/0 ->", parseQuantityText("1/0"));

console.log("\nparseIngredientLine samples:");
let failed = 0;
for (const { line, expectQty, expectUnit, expectName } of cases) {
  const r = parseIngredientLine(line);
  const qtyOk =
    expectQty === null
      ? r.quantity === null
      : r.quantity !== null && approx(r.quantity, expectQty);
  const unitOk = (expectUnit === null && r.unit === null) || r.unit === expectUnit;
  const nameOk = r.name.trim() === expectName;
  const ok = qtyOk && unitOk && nameOk;
  if (!ok) failed++;
  console.log(
    ok ? "  ✓" : "  ✗",
    JSON.stringify(line),
    "->",
    { quantity: r.quantity, unit: r.unit, name: r.name },
    ok ? "" : `(expected qty≈${expectQty}, unit=${expectUnit}, name=${expectName})`
  );
}
process.exit(failed > 0 ? 1 : 0);
