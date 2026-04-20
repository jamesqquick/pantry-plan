-- Minimal Phase 1 seed for D1 verification.
-- A richer seed (users, recipes, orders, 100+ ingredients) lands in Phase 4
-- once the ingredient normalization library is ported.

DELETE FROM IngredientAlias;
DELETE FROM IngredientSubcategory;
DELETE FROM IngredientCategory;
DELETE FROM Ingredient;

-- Categories
INSERT INTO IngredientCategory (id, name) VALUES
  ('seed_cat_001', 'Baking & Sweeteners'),
  ('seed_cat_002', 'Dairy & Eggs'),
  ('seed_cat_003', 'Pantry Staples');

-- Subcategories
INSERT INTO IngredientSubcategory (id, name, ingredientCategoryId) VALUES
  ('seed_subcat_001', 'Sugar',  'seed_cat_001'),
  ('seed_subcat_002', 'Flour',  'seed_cat_001'),
  ('seed_subcat_003', 'Eggs',   'seed_cat_002'),
  ('seed_subcat_004', 'Milk/Cream', 'seed_cat_002'),
  ('seed_subcat_005', 'Salt',   'seed_cat_003');

-- A handful of ingredients (global, userId = NULL) so the catalog isn't empty.
INSERT INTO Ingredient
  (id, userId, name, normalizedName, category, subcategory,
   costBasisUnit, estimatedCentsPerBasisUnit, gramsPerCup,
   conversionConfidence, costConfidence, preferredDisplayUnit)
VALUES
  ('seed_ing_001', NULL, 'all-purpose flour',        'all purpose flour',      'Baking & Sweeteners', 'Flour', 'G',     0.3,  120, 'High', 'High', 'CUP'),
  ('seed_ing_002', NULL, 'light brown sugar',        'light brown sugar',      'Baking & Sweeteners', 'Sugar', 'G',     0.4,  220, 'High', 'High', 'CUP'),
  ('seed_ing_003', NULL, 'granulated sugar',         'sugar',                  'Baking & Sweeteners', 'Sugar', 'G',     0.3,  200, 'High', 'High', 'CUP'),
  ('seed_ing_004', NULL, 'powdered sugar',           'powdered sugar',         'Baking & Sweeteners', 'Sugar', 'G',     0.5,  120, 'High', 'High', 'CUP'),
  ('seed_ing_005', NULL, 'butter',                   'butter',                 'Dairy & Eggs',        'Fat',   'G',     1.2,  227, 'High', 'High', 'TBSP'),
  ('seed_ing_006', NULL, 'eggs',                     'eggs',                   'Dairy & Eggs',        'Eggs',  'COUNT', 25.0, NULL, 'High', 'High', 'EACH'),
  ('seed_ing_007', NULL, 'whole milk',               'whole milk',             'Dairy & Eggs',        'Milk/Cream', 'G', 0.5, 240, 'High', 'High', 'CUP'),
  ('seed_ing_008', NULL, 'fine sea salt',            'fine sea salt',          'Pantry Staples',      'Salt',  'G',     0.2,  280, 'High', 'High', 'TSP');

-- Aliases so import matching has something to look at.
INSERT INTO IngredientAlias (id, ingredientId, aliasNormalized) VALUES
  ('seed_alias_001', 'seed_ing_001', 'ap flour'),
  ('seed_alias_002', 'seed_ing_001', 'plain flour'),
  ('seed_alias_003', 'seed_ing_002', 'brown sugar'),
  ('seed_alias_004', 'seed_ing_003', 'white sugar'),
  ('seed_alias_005', 'seed_ing_004', 'confectioners sugar'),
  ('seed_alias_006', 'seed_ing_004', 'icing sugar'),
  ('seed_alias_007', 'seed_ing_005', 'unsalted butter'),
  ('seed_alias_008', 'seed_ing_005', 'salted butter'),
  ('seed_alias_009', 'seed_ing_006', 'egg'),
  ('seed_alias_010', 'seed_ing_006', 'large eggs'),
  ('seed_alias_011', 'seed_ing_007', 'milk'),
  ('seed_alias_012', 'seed_ing_008', 'salt'),
  ('seed_alias_013', 'seed_ing_008', 'sea salt'),
  ('seed_alias_014', 'seed_ing_008', 'table salt');
