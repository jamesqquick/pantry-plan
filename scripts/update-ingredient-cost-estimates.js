/**
 * One-off: set estimated_cents_per_basis_unit for ingredients with 0 or missing.
 * Estimates are rough US grocery (cents per gram for GRAM, per cup for CUP, per each for EACH).
 */
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/ingredients_500.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

// Cents per gram (GRAM basis) unless noted. Rough US grocery ballpark.
function getEstimateCentsPerGram(ing) {
  const name = (ing.name || "").toLowerCase();
  const cat = (ing.category || "").toLowerCase();
  const sub = (ing.subcategory || "").toLowerCase();

  // Name-specific overrides
  const nameMap = {
    "all-purpose flour": 0.12,
    "bread flour": 0.12,
    "whole wheat flour": 0.14,
    "self-rising flour": 0.13,
    "pastry flour": 0.13,
    "gluten-free flour blend": 0.9,
    "almond flour": 1.8,
    "coconut flour": 1.3,
    "cornstarch": 0.08,
    "cornmeal": 0.1,
    "semolina flour": 0.15,
    "rye flour": 0.2,
    "oat flour": 0.25,
    "powdered sugar": 0.35,
    "turbinado sugar": 0.5,
    "demerara sugar": 0.5,
    "coconut sugar": 0.6,
    "molasses": 0.3,
    "agave nectar": 0.4,
    "baking soda": 0.02,
    "salted butter": 0.9,
    "ghee": 1.3,
    "eggnog": 0.12,
    "arborio rice": 0.4,
    "quinoa": 0.5,
    "farro": 0.3,
    "spaghetti": 0.22,
    "penne": 0.22,
    "fusilli": 0.22,
    "fettuccine": 0.22,
    "linguine": 0.22,
    "elbow macaroni": 0.22,
    "tomato paste": 0.25,
  };
  if (nameMap[name] != null) return nameMap[name];

  // Subcategory defaults
  if (sub.includes("flour")) return 0.15;
  if (sub.includes("sugar")) return 0.4;
  if (sub.includes("baking add-in") || sub === "baking") return 0.1;
  if (sub.includes("beans") || sub.includes("legumes")) {
    if (name.includes("(dry)")) return 0.28;
    return 0.24; // cooked/canned
  }
  if (sub.includes("milk") || sub.includes("cream")) return 0.15;
  if (sub.includes("broth") || sub.includes("stock")) return 0.22;
  if (sub.includes("canned tomato")) return name.includes("paste") ? 0.25 : 0.14;
  if (sub.includes("rice") || sub.includes("grain (dry)")) return 0.22;
  if (sub.includes("pasta")) return 0.22;
  if (sub.includes("oil")) return 0.25;
  if (sub.includes("vinegar")) return 0.15;
  if (sub.includes("sauce")) return 0.2;
  if (sub.includes("nut") && !sub.includes("flour")) return 0.8;
  if (sub.includes("seed")) return 0.5;
  if (sub.includes("spice") || sub.includes("herb")) return 0.5;
  if (sub.includes("condiment")) return 0.2;
  if (sub.includes("canned")) return 0.15;
  if (sub.includes("pickled")) return 0.2;
  if (sub.includes("dried fruit")) return 0.6;
  if (sub.includes("nut butter")) return 0.5;
  if (sub.includes("jam") || sub.includes("preserve")) return 0.35;
  if (sub.includes("honey") || sub.includes("maple")) return 0.4;
  if (sub.includes("chocolate")) return 0.6;
  if (sub.includes("cheese")) return 0.5;
  if (sub.includes("yogurt")) return 0.15;
  if (sub.includes("egg")) return 0.2;
  if (sub.includes("meat") || sub.includes("poultry") || sub.includes("seafood")) return 0.8;
  if (sub.includes("tofu") || sub.includes("tempeh")) return 0.35;
  if (sub.includes("bread") || sub.includes("tortilla")) return 0.15;
  if (sub.includes("cereal")) return 0.2;
  if (sub.includes("vegetable") || sub.includes("fruit")) return 0.15;
  if (sub.includes("green") && sub.includes("leaf")) return 0.3;

  // Category fallback
  if (cat.includes("baking")) return 0.2;
  if (cat.includes("dairy")) return 0.25;
  if (cat.includes("pantry")) return 0.2;
  if (cat.includes("grains")) return 0.22;
  if (cat.includes("proteins")) return 0.4;
  if (cat.includes("produce") || cat.includes("vegetable") || cat.includes("fruit")) return 0.2;
  if (cat.includes("condiment")) return 0.25;

  return 0.2; // default
}

function getEstimateCentsPerCup(ing) {
  const name = (ing.name || "").toLowerCase();
  const sub = (ing.subcategory || "").toLowerCase();
  if (sub.includes("broth") || sub.includes("stock")) return 12; // ~$2/quart, 4 cups
  if (sub.includes("canned tomato")) return 15;
  if (sub.includes("milk") || sub.includes("cream")) return 25;
  if (name.includes("sauce")) return 20;
  return 18;
}

function getEstimateCentsPerEach(ing) {
  return 150; // $1.50 per item default
}

function roundCents(v) {
  return Math.round(v * 100) / 100;
}

function walkAndUpdate(arr) {
  let updated = 0;
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    if (Array.isArray(el)) {
      updated += walkAndUpdate(el);
    } else if (el && typeof el === "object" && "name" in el) {
      const current = el.estimated_cents_per_basis_unit;
      if (current === 0 || current === undefined || current === null) {
        const basis = el.cost_basis_unit || "GRAM";
        let est;
        if (basis === "CUP") est = getEstimateCentsPerCup(el);
        else if (basis === "EACH") est = getEstimateCentsPerEach(el);
        else est = getEstimateCentsPerGram(el);
        el.estimated_cents_per_basis_unit = roundCents(est);
        updated++;
      }
    }
  }
  return updated;
}

const count = walkAndUpdate(data);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");

