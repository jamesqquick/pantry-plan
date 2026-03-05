# Recipes App

Next.js recipe parsing app: sign up, add recipes manually or import from a URL (JSON-LD parsing with SSRF protections).

## Tech

- **Next.js** (App Router), **Server Actions**, **Zod**, **Tailwind CSS**, **Prisma**, **Auth.js (NextAuth v5)** Credentials.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `AUTH_SECRET` – e.g. `openssl rand -base64 32`
   - `DATABASE_URL` – default `file:./dev.db` is fine for local.
   - `NEXTAUTH_URL` – `http://localhost:3000` for local.
3. **Database**

   ```bash
   npx prisma migrate dev
   ```

4. **Seed (optional)**

   **The seed script wipes the database** and then creates a single demo user plus 100 baking ingredients and aliases. All existing users, recipes, ingredients, and orders are deleted. Run only in development or when you want a clean slate.

   ```bash
   npm run seed
   ```

   **Demo user:** `demo@bytheboysbakery.com` / `demo-password-123`. Sign in with this to use the seeded ingredient catalog.

5. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Verify

1. **Auth** – You should be redirected to `/login`. Register at `/register`, then sign in. You should land on `/recipes`.
2. **Recipes** – Click “Add recipe”. Use “Import from URL” (paste a recipe URL and click Import) or “Or enter manually” (title, instructions, ingredients, then “Continue to mapping”). In the mapping step, map each ingredient line to your catalog or create new ingredients, then click “Save recipe”. You are redirected to the new recipe page.
3. **Edit** – Open a recipe, click “Edit”, change fields, save. You should be redirected to the recipe view.
4. **Delete** – On a recipe view, click “Delete”, confirm. You should be redirected to the recipe list.
5. **Import** – On “New recipe”, paste a recipe URL and click “Import”. You’ll see the ingredient mapping step; apply suggestions or map each line, then “Save recipe”.
6. **SSRF** – Try “Import from URL” with `http://localhost` or `http://127.0.0.1`; you should see an error (URL not allowed).

## Routes

- `/` – redirects to `/recipes` or `/login`
- `/login`, `/register` – public
- `/recipes` – list (protected)
- `/recipes/new` – create (protected): import from URL + manual form
- `/recipes/[id]` – view (protected)
- `/recipes/[id]/edit` – edit (protected)
- `/orders` – list orders (protected)
- `/orders/new` – create order: pick recipes + batches (protected)
- `/orders/[id]` – view order, grocery list, cost estimate (protected)
- `/orders/[id]/edit` – edit order (protected)
- `/ingredients` – list ingredients (protected)
- `/ingredients/new` – create ingredient (protected)
- `/ingredients/[id]/edit` – edit ingredient (protected)

## Ingredients catalog

- **Ingredients** are a per-user catalog of ingredient names with optional category, default unit, **cost basis unit** (GRAM / MILLILITER / EACH), **estimated cents per basis unit**, and notes.
- **Conversion metadata** supports volume↔weight for recipes and cost estimates:
  - **gramsPerCup** – weight in grams per US cup (for dry/semi-solid ingredients).
  - **gramsPerMl** – weight in grams per milliliter (for liquids; 1 cup ≈ 236.588 ml).
  - **conversionConfidence** – `HIGH`, `MEDIUM`, or `LOW` (how reliable the conversion is).
  - **conversionNotes** – e.g. “Packed varies.”, “Approx; varies by brand.”
- Use **Ingredients** in the nav to list, search, create, and edit. Names are normalized for deduplication (e.g. “All-Purpose Flour” and “all purpose flour” map to one ingredient).
- Deleting an ingredient is blocked with a friendly error if it is used in any recipe; remove it from those recipes’ structured ingredients first.

## Extending the seed ingredient list

- The seed data lives in **`prisma/seed.ts`** in the `SEED_INGREDIENTS` array. Each entry has: `name`, `category`, `costBasisUnit`, optional `defaultUnit`, `gramsPerCup` / `gramsPerMl`, `conversionConfidence`, `conversionNotes`, and `estimatedCentsPerBasisUnit`.
- To add or change ingredients: edit `SEED_INGREDIENTS`, then run `npm run seed` again (this wipes the DB and reseeds). Keep exactly 100 entries if you rely on the runtime assertion, or adjust the validation in `main()`.
- To add aliases (e.g. “ap flour” → all-purpose flour), edit the `SEED_ALIASES` array; `aliasNormalized` and `targetNormalizedName` must match the normalized forms produced by `normalizeIngredientName()`.

## Structured recipe ingredients

- Each recipe can have **structured ingredients**: rows linking to your ingredients catalog with quantity, unit, optional flag, and notes. Raw ingredient lines (the original text list) are kept on the recipe for reference and are not removed.
- On **Recipe → Edit**, the **Structured ingredients** section lets you add rows (pick ingredient, set quantity/unit, optional, notes), reorder, and **Save structured ingredients**.
- The recipe **view** page shows structured ingredients when present (formatted as “quantity unit name”); otherwise it shows the raw lines.

## How to migrate raw ingredients

- On a recipe’s edit page, use **Auto-create from raw lines** in the Structured ingredients section. The app parses each raw line (best-effort quantity/unit), normalizes the name, and creates catalog ingredients if missing. Structured rows are created and replace any existing structured ingredients for that recipe. Raw lines in the recipe are left unchanged.

## Recipe import ingredient mapping step

- When you **create a new recipe** (from URL or manual entry), the flow is two steps: (1) **Import** – paste a recipe URL and click Import/Parse (the manual entry form is then populated so you can review and edit), or enter title, instructions, and ingredient lines manually and click “Continue to mapping”; (2) **Mapping** – for each ingredient line you see the original line and a suggested mapping to your ingredients catalog. Match types: **Exact** (normalizedName match), **Alias** (learned or seeded alias), or **Fuzzy** (token similarity). Use **Apply suggestions** to accept all suggestions, or **Create all unmapped as new ingredients** to fill unmapped rows. When every row is mapped, **Save recipe** creates the recipe, structured ingredients, and raw lines; you are redirected to the recipe page.

## Aliases learned from mappings

- When you save an imported recipe, each mapped line is stored as a **RecipeIngredient** with an optional **IngredientAlias**: the normalized form of the line is associated with the ingredient you chose. On future imports, that alias is used so the same line (e.g. “2 cups all-purpose flour”) is suggested to map to the same ingredient without fuzzy matching. Aliases are per-user and are updated if you map the same normalized line to a different ingredient later.

## How normalization works (high level)

- Ingredient names and import lines are **normalized** for matching: lowercase, remove parentheticals, strip punctuation, collapse spaces, remove trailing “stopwords” (e.g. “diced”, “optional”, “to taste”), apply a **synonyms** map (e.g. “granulated sugar” → “sugar”), and optional leading descriptor removal. This produces a **normalizedKey** used for exact/alias lookups and for learning aliases when you save.

## Limitations of parsing

- Migration from raw lines is best-effort: fractions and phrases like “1 (14 oz) can …” may not parse perfectly; unknown quantity or unit are stored as null. You can correct rows in the structured editor after migrating.
- **Import mapping**: Fuzzy matching uses token-overlap (Jaccard) similarity. The stopwords and descriptor lists are fixed; very domain-specific phrases may not normalize as expected.

## Orders

- **Orders** are shopping/catering orders: a name, optional notes, and a list of recipes with **batch counts** (e.g. 2x Chocolate Chip Cookies, 1x Tomato Pasta).
- Create an order from **Orders → New order**: add one or more of your recipes and set how many batches of each. Save to see the order and its **grocery list** and **cost estimate**.

## Grocery list & cost estimation

- On an order’s detail page, the app **aggregates ingredients** from all recipes (scaled by batches), **normalizes** ingredient names, and **merges** same ingredient + unit into one line.
- **Cost estimate** uses each ingredient’s **basis unit** (GRAM, MILLILITER, or EACH) and **estimated cents per basis unit**. The app converts each grocery line’s quantity/unit to the ingredient’s basis (e.g. cups → grams for flour, count for eggs), then multiplies by cents per basis unit. No volume↔weight density conversions; incompatible conversions are reported as missing.
- **Missing costs**: Set **cost basis unit** and **estimated cents per basis unit** in the Ingredients catalog for any ingredient you want included in the estimate. Missing items are listed on the order page.

## Ingredient cost (basis unit)

- Each ingredient has a **cost basis unit** (GRAM, MILLILITER, EACH) and optional **estimated cents per basis unit**. Examples: flour → GRAM; milk → MILLILITER; eggs → EACH. The seed script populates a **baking-only** catalog (flours, sugars, fats, leaveners, chocolates, extracts, nuts, etc.) with placeholder values. Run `npm run seed` to reset the DB and load baking data.

## Project rules

See **RULES.md** for architecture, patterns, and quality bar.
