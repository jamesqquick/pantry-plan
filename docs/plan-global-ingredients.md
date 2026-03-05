# Plan: Make Ingredients Application-Level (Global)

**Goal:** Remove user association from the `Ingredient` and `IngredientAlias` models so ingredients and aliases are global. Recipes, recipe ingredients, and orders remain user-scoped.

**Assumption:** We are starting from scratch with fresh data. No existing data will be migrated. The database will be wiped, the seed updated to create global ingredients, and then the DB will be seeded with fresh, appropriate data.

---

## 1. Schema changes (`prisma/schema.prisma`)

### 1.1 `Ingredient` model
- **Remove:** `userId` field and `user` relation.
- **Uniqueness:** Replace `@@unique([userId, normalizedName])` with `@@unique([normalizedName])` so ingredient names are unique across the app.
- **Indexes:** Remove `@@index([userId, name])`. Keep or add `@@index([normalizedName])` and keep `@@index([category])`, `@@index([category, subcategory])`.

### 1.2 `IngredientAlias` model
- **Remove:** `userId` field and `user` relation.
- **Uniqueness:** Replace `@@unique([userId, aliasNormalized])` with `@@unique([aliasNormalized])` so each alias maps to one ingredient app-wide.
- **Indexes:** Remove `@@index([userId, ingredientId])`. Keep or add an index on `aliasNormalized` / `ingredientId` if needed for lookups.

### 1.3 `User` model
- **Remove:** `ingredients Ingredient[]` and `ingredientAliases IngredientAlias[]` relations (users no longer “own” ingredients or aliases).

### 1.4 No changes to
- `Recipe`, `RecipeIngredient`, `Order`, `OrderItem` — still scoped by `userId` where applicable.
- `RecipeIngredient.ingredientId` — still references `Ingredient.id`.
- `IngredientAlias.ingredientId` — still references `Ingredient.id` (alias → global ingredient).

---

## 2. Database migration and fresh seed

Because we are not migrating existing data:

1. **Update the schema** as in §1 (remove `Ingredient.userId` and `User.ingredients`; remove `IngredientAlias.userId` and `User.ingredientAliases`; add `@@unique([normalizedName])` on `Ingredient` and `@@unique([aliasNormalized])` on `IngredientAlias`).
2. **Create a new migration** (e.g. `prisma migrate dev --name ingredients_and_aliases_global`) that:
   - Drops the `Ingredient` table’s `userId` column and its foreign key; drops the old unique on `(userId, normalizedName)`; adds a unique constraint on `normalizedName`.
   - Drops the `IngredientAlias` table’s `userId` column and its foreign key; drops the old unique on `(userId, aliasNormalized)`; adds a unique constraint on `aliasNormalized`.
3. **Wipe the database and apply migrations.** Either:
   - Run `prisma migrate reset` (applies all migrations from scratch and runs seed), or  
   - Manually clear the DB and run `prisma migrate deploy` (or `migrate dev`), then run the seed.
4. **Run the seed.** The updated seed (§3) creates global ingredients and global aliases (no `userId` on either), the demo user, and user-scoped recipes and orders that reference those ingredients. No data from a previous DB is preserved.

No logic is needed to merge duplicate ingredients or repoint existing `RecipeIngredient` / `IngredientAlias` rows; the seed is the source of truth for the new state.

---

## 3. Seed (`prisma/seed.ts`)

The seed runs after a fresh DB (or reset) and is the only source of initial ingredient data. Update it as follows:

- **Create ingredients:** Omit `userId` from every `prisma.ingredient.create` payload. Use the same `mappedRows` structure but remove `userId` so all ingredients are global.
- **Lookup after seed:** Replace `prisma.ingredient.findMany({ where: { userId: user.id }, ... })` with `prisma.ingredient.findMany({ select: { id: true, normalizedName: true } })` (no user filter) when building `ingredientIdsByNormalizedName` for recipes and aliases.
- **Aliases:** Create `IngredientAlias` without `userId`: only `ingredientId` and `aliasNormalized`. Use `upsert` keyed by `aliasNormalized` (or create with unique on `aliasNormalized`). All aliases are global.
- **Recipes / orders:** Unchanged; still created with `userId: user.id` and reference the global ingredient ids.
- **Deletes:** `prisma.ingredient.deleteMany({})` and `prisma.ingredientAlias.deleteMany({})` remain valid (no `where: { userId }` needed). The seed’s existing order of operations (e.g. delete recipe ingredients, aliases, then ingredients, then create ingredients, then aliases, then recipes) stays appropriate.

---

## 4. Query layer (`lib/queries/ingredients.ts`)

- **`getIngredientCostMap(userId)`:** Remove the `userId` parameter from the query. Use `db.ingredient.findMany({ ... })` with no `where: { userId }`. Callers can keep passing `userId` for API compatibility or you can remove it and update call sites (e.g. `lib/estimate/run-estimate.ts`).
- **`listIngredientsForUser(userId, options)`:** Remove user filter: `where` should only include search (name / normalizedName) if present. Optionally rename to `listIngredients` and keep `userId` only for future use (e.g. filtering) or drop it.
- **`countIngredientsForUser(userId, options)`:** Same: remove `userId` from `where`. Optionally rename to `countIngredients`.
- **`getIngredientForUser(id, userId)`:** Replace with `getIngredient(id)`: `db.ingredient.findUnique({ where: { id } })`. No ownership check.
- **`buildListWhere`:** Remove `userId` from the base `where`; keep only search-based filters.

---

## 5. Server actions

### 5.1 `app/actions/ingredients.actions.ts`
- **createIngredientAction:**  
  - Check existence with `findUnique({ where: { normalizedName } })` (no `userId`).  
  - Create with `prisma.ingredient.create` and no `userId`.
- **updateIngredientAction:**  
  - Replace `findFirst({ where: { id, userId } })` with `findUnique({ where: { id } })`. Remove ownership check (or later restrict to admin).
- **deleteIngredientAction:**  
  - Same: find by `id` only; keep the check for `recipeIngredients` usage before delete.
- **upsertFromNameAction:**  
  - Lookup by `findUnique({ where: { normalizedName } })`.  
  - Create with no `userId`.
- **updateIngredientPreferencesAction:**  
  - Find ingredient by `id` only (no `userId`).
- **searchIngredientsForPickerAction:**  
  - Call `listIngredients` (or equivalent) with no user filter; optionally keep `user.id` for logging/revalidation only.

### 5.2 `app/actions/import.actions.ts` (`saveImportedRecipeWithMappingsAction`)
- **Lookup by id:** Replace `findFirst({ where: { id: line.ingredientId.trim(), userId: user.id } })` with `findUnique({ where: { id: line.ingredientId.trim() } })`.
- **Lookup by name (create new):** Replace `findUnique({ where: { userId_normalizedName: { userId: user.id, normalizedName } } })` with `findUnique({ where: { normalizedName } })`.  
- **Create new ingredient:** `ingredient.create` with no `userId`.
- **Alias upsert:** Use global alias: `IngredientAlias.upsert` keyed by `aliasNormalized` only (no `userId`). Create/update with `ingredientId` and `aliasNormalized`.

### 5.3 `app/actions/ingredient-mapping.actions.ts`
- **suggestIngredientMappingsAction:**  
  - Replace `db.ingredient.findMany({ where: { userId: user.id }, ... })` with `db.ingredient.findMany({ ... })` (all global ingredients).  
  - Replace `db.ingredientAlias.findMany({ where: { userId: user.id }, ... })` with `db.ingredientAlias.findMany({ ... })` (all global aliases).

---

## 6. Mapping / suggestion logic (`lib/ingredients/mapping.ts`)

- **getDeterministicMatches:**  
  - Ingredient lookup: `db.ingredient.findUnique({ where: { normalizedName: params.normalizedKey.trim() } })`.  
  - Alias lookup: `db.ingredientAlias.findUnique({ where: { aliasNormalized: params.normalizedKey.trim() }, include: { ingredient: { select: { id, name, normalizedName } } } })` (no `userId`).
- **getCandidateList:**  
  - Replace `db.ingredient.findMany({ where: { userId: params.userId }, ... })` with `db.ingredient.findMany({ ... })` (no user filter).  
  - Alias resolution is global; `userId` can be removed from the function signature if no longer used.

---

## 7. Estimate (`lib/estimate/run-estimate.ts`)

- **getIngredientCostMap:** Call with no user filter (or remove `userId` argument and update to use the new global `getIngredientCostMap()`).

---

## 8. Pages and components

- **`app/(app)/ingredients/page.tsx`:**  
  - Fetch list with the new global list function (e.g. `listIngredients({ search, skip, take })`). No `session.user.id` needed for the query (keep auth for access control).
- **`app/(app)/ingredients/[id]/edit/page.tsx`:**  
  - Load ingredient with `getIngredient(id)` (no user id). Keep auth; any authenticated user can view/edit global ingredient unless you add an admin check later.
- **Recipe/import UI:**  
  - No change to props; catalog is still loaded via `searchIngredientsForPickerAction` / list, which will now return global ingredients.  
  - `ingredientsCatalog={[]}` on new/edit recipe pages can stay as-is (catalog is populated by search).

---

## 9. Revalidation and auth

- Keep `revalidatePath("/ingredients")` (and any ingredient detail paths) in actions so the ingredients list and edit pages refresh after create/update/delete.
- All ingredient actions should still call `getAuthenticatedUser()` so only logged-in users can list/create/update/delete ingredients (unless you later restrict create/update/delete to admins).

---

## 10. Summary checklist

| Area | Change |
|------|--------|
| **Schema** | Remove `Ingredient.userId` and `User.ingredients`; remove `IngredientAlias.userId` and `User.ingredientAliases`; add `@@unique([normalizedName])` on `Ingredient` and `@@unique([aliasNormalized])` on `IngredientAlias`. |
| **Migration** | Drop `userId` from `Ingredient` and `IngredientAlias`; add unique on `normalizedName` and on `aliasNormalized`. Then wipe DB and run seed (no data migration). |
| **Seed** | Create ingredients and aliases without `userId`; build `ingredientIdsByNormalizedName` from all ingredients; seed is source of fresh data. |
| **Queries** | `getIngredientCostMap`, `listIngredientsForUser`, `countIngredientsForUser`, `getIngredientForUser` → no user filter (or rename and drop param). |
| **Actions** | All ingredient and alias lookups/creates: by `id`, `normalizedName`, or `aliasNormalized` only; no `userId`. |
| **Mapping** | Deterministic match by `normalizedName` or global alias `aliasNormalized`; candidates from all ingredients; aliases global. |
| **Estimate** | Cost map from all ingredients. |
| **Pages** | Ingredients list and edit use global list/get; auth unchanged. |

---

## 11. Optional follow-ups

- **Authorization:** Restrict create/update/delete of ingredients to an “admin” role if you add one.
- **Audit:** Add `createdBy` / `updatedBy` (user id) on `Ingredient` for traceability without making ingredients user-scoped.
- **Docs:** Update README to say ingredients and aliases are a shared, app-wide catalog.
