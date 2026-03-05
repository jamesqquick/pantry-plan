# Plan: OpenAI mapping from URL-loaded data to structured recipe form

## Goal

Use OpenAI to map the data we already load from a user-entered URL (parsed recipe) into the **exact structured shape** the new recipe form expects: recipe metadata plus **structured ingredient rows** (ingredientId or suggested name, quantity, unit, displayText) so the form can prefill without a separate heuristic parse + catalog suggestion round-trip.

---

## Current state

1. **URL → draft**
   - User enters URL → `parseRecipeFromUrlAction` runs.
   - Backend: `fetchHtml` → `extractJsonLd` → `findRecipeInJsonLd` → `normalizeRecipe` → `NormalizedRecipe`.
   - Validated with `recipeCreateSchema`; each ingredient line is run through `parseIngredientLineForImport` (heuristic).
   - Returns **ParsedRecipeDraft**: `title`, `sourceUrl`, `imageUrl`, `servings`, times, `ingredients[]`, `ingredientLines[]`, `instructions[]`, `notes`.

2. **Draft → form**
   - New recipe workflow receives the draft.
   - If there are ingredients, it calls **`suggestIngredientMappingsAction({ lines })`**: exact/alias/fuzzy match against user’s ingredient catalog; unmapped lines can be sent to **LLM** (`suggestMappingsWithLLM`) for `ingredientId` or `createName`.
   - Then **`buildStructuredItemsFromImport`** builds `StructuredItem[]` using:
     - Heuristic **`parseIngredientLineStructured`** for quantity/unit/name.
     - Suggestion for `ingredientId` / `ingredientName`.
   - Form receives `prefillData` (draft) + `prefillStructuredItems` (StructuredItem[]).

3. **Form shape**
   - **Recipe:** `recipeCreateSchema` (title, sourceUrl, imageUrl, servings, times, instructions, notes, tagIds).
   - **StructuredItem** (per row): `ingredientId`, `ingredientName`, `quantity`, `unit` (IngredientUnit), `displayText`, `rawText`, `sortOrder`.

So today we already use OpenAI for **ingredient mapping** (catalog match or createName) for unmapped lines; quantity/unit/name still come from the heuristic parser.

---

## Target behavior

- **Input:** The data we load from the URL — i.e. **ParsedRecipeDraft** (or the raw **NormalizedRecipe** before ingredient line parsing), plus the **user’s ingredient catalog** (id, name, normalizedName) so the model can suggest `ingredientId` when appropriate.
- **Output:** Same recipe metadata the form expects, plus an array of **structured ingredient rows** in the form’s shape: each row has `quantity`, `unit`, `displayText`, and either `ingredientId` (from catalog) or `suggestedCreateName` (for new ingredients). No separate heuristic parse or second LLM call for mapping.
- **Integration:** After a successful URL parse, either:
  - **Option A:** Run OpenAI mapping in the same action and return a single “draft + structured items” payload to the new recipe workflow, or
  - **Option B:** New optional action “map URL draft to structured” that the client calls with the draft (and catalog is loaded server-side); form then receives draft + structured items in one go.

Option A keeps one round-trip (URL → server → draft+structured); Option B allows the client to show the raw draft first and then “Apply AI structure” if desired.

---

## Implementation plan

### 1. Define the LLM contract (Zod + types)

- **Input type:**  
  - Recipe: `title`, `sourceUrl?`, `imageUrl?`, `servings?`, `prepTimeMinutes?`, `cookTimeMinutes?`, `totalTimeMinutes?`, `ingredients[]`, `instructions[]`, `notes?`.  
  - Catalog: `{ id, normalizedName, name }[]` (same as existing LLM mapping; cap e.g. 500 entries).
- **Output schema (Zod):**  
  - Recipe fields (same as above, so we can normalize/clean if needed).  
  - `structuredIngredients`: array of:
    - `sortOrder` (number, 0-based)
    - `quantity` (number | null)
    - `unit` (string: one of the app’s IngredientUnit labels, e.g. "cup", "tsp", "count", "g", "kg", "oz", "lb", "tbsp"; map to enum in code)
    - `displayText` (string, required)
    - `rawText` (string, original line)
    - either `ingredientId` (UUID from catalog) or `suggestedCreateName` (string), not both
  - Validate with `safeParse`; on failure treat as “LLM didn’t return valid structure” and fall back to current pipeline.

- **File:** Add a schema (and shared types) e.g. in `features/import/` or `lib/parse/` (e.g. `url-to-structured-recipe.schemas.ts`) so both the LLM module and the action can use it. Keep IngredientUnit enum mapping in one place (reuse `UNIT_FROM_LABEL` or a reverse map).

### 2. New server-only module: URL draft → structured recipe via OpenAI

- **Location:** e.g. `lib/parse/map-url-draft-to-structured-openai.ts` (or `lib/ingredients/` if you prefer to colocate with other LLM mapping).
- **Function:** e.g. `mapUrlDraftToStructured(draft, catalog): Promise<MapUrlDraftResult | MapUrlDraftError>`.
  - **draft:** ParsedRecipeDraft (or a minimal type with title, ingredients[], instructions[], times, notes, sourceUrl, imageUrl).
  - **catalog:** `CatalogEntry[]` (id, normalizedName, name) — same as `suggestMappingsWithLLM`.
  - Build a single prompt that includes:
    - Instruction: given this recipe (title, ingredients list, instructions, optional times/servings/notes), produce the same recipe plus a structured ingredient list.
    - The list of ingredient lines (with index).
    - The catalog (id, normalized name) so the model can output `ingredientId` when a line clearly matches, otherwise `suggestedCreateName`.
    - Output format: JSON matching the Zod schema (quantity, unit as label, displayText, rawText, sortOrder, ingredientId or suggestedCreateName).
  - Use `response_format: { type: "json_object" }`, parse response, run Zod `safeParse`.
  - Map validated result into:
    - Recipe part: same shape as current draft (so we can return a ParsedRecipeDraft).
    - Structured part: array of items that the frontend can turn into **StructuredItem[]** (map unit string → IngredientUnit via `UNIT_FROM_LABEL`; set `ingredientName` from catalog when `ingredientId` is present, else `suggestedCreateName`).
  - On missing `OPENAI_API_KEY`, invalid JSON, or Zod failure: return an error so the caller can fall back to the current pipeline.
  - Reuse existing `logLlmRequest` (e.g. context `"url-to-structured-recipe"`).

### 3. Server action integration

- **Option A – inside parse flow:**  
  - In `parseRecipeFromUrlAction`, after we have the validated draft and `ingredientLines`, if `OPENAI_API_KEY` is set and ingredients exist, call `mapUrlDraftToStructured(draft, catalog)`.  
  - On success: return the same action result shape but with an additional field (e.g. `structuredItems`) that the new recipe workflow can use as `prefillStructuredItems`.  
  - On failure: omit `structuredItems` (or set to null); frontend continues to use current behavior (suggestIngredientMappingsAction + buildStructuredItemsFromImport).

- **Option B – separate action:**  
  - New action e.g. `mapUrlDraftToStructuredAction(prev, formData)` that accepts the draft (e.g. as JSON in formData or as a single field). Load catalog server-side (same as suggestIngredientMappingsAction). Return `{ ok: true, data: { draft, structuredItems } }` or `{ ok: false, error }`.  
  - New recipe workflow: after URL parse, optionally call this action and use result to set `prefillData` + `prefillStructuredItems`; otherwise keep current flow.

Recommendation: start with **Option A** for a simpler UX (one click → prefilled structured form when possible); add Option B later if you want an explicit “Structure with AI” step.

### 4. New recipe workflow changes

- If the parse action returns `structuredItems` (and it’s non-empty), use it directly as `prefillStructuredItems` and **do not** call `suggestIngredientMappingsAction` or `buildStructuredItemsFromImport` for that import.
- If `structuredItems` is missing or empty, keep current behavior: call `suggestIngredientMappingsAction` and `buildStructuredItemsFromImport` so the form still gets best-effort structured rows.

### 5. Validation and security

- **Treat LLM output as untrusted:** Only use it after Zod validation. Map unit strings to enum; reject unknown units or set to null.
- **Catalog scope:** Only pass ingredients the user is allowed to see (same as suggestIngredientMappingsAction: `userId: null` or `user.id`).
- **IDs:** If the LLM returns an `ingredientId`, verify it exists in the catalog before attaching to a row; otherwise treat as unmapped and use `suggestedCreateName` if present.
- **Length limits:** Cap instructions/ingredients in the prompt if needed to stay within token limits; catalog already capped (e.g. 500).

### 6. Error handling and fallback

- If `mapUrlDraftToStructured` fails (no key, API error, invalid JSON/schema): return a result that does not include `structuredItems`. The UI should not show an error for “AI structure unavailable”; it should just show the draft and use the existing mapping + heuristic structure path.
- Optional: surface a subtle message like “Structured ingredients could not be generated; you can still map ingredients below.”

### 7. Optional future: raw HTML when JSON-LD is missing

- Today we only get “data from URL” when the page has JSON-LD. If we later want to support URLs with no JSON-LD, we could add a path: fetch HTML → extract main text (or send snippet) → call OpenAI to extract recipe (similar to image extraction) → then run the same “map to structured” step. That would be a separate follow-up (e.g. “parse from URL with fallback to LLM extraction”).

---

## Files to add or touch

| Area | File | Change |
|------|------|--------|
| Schema / types | `features/import/url-to-structured.schemas.ts` or under `lib/parse/` | New Zod schema + types for LLM output (recipe + structuredIngredients). |
| LLM module | `lib/parse/map-url-draft-to-structured-openai.ts` | New: `mapUrlDraftToStructured(draft, catalog)`, prompt, parse, validate, return draft + structured rows. |
| Action | `app/actions/parse.actions.ts` | After building ParsedRecipeDraft, optionally call `mapUrlDraftToStructured`, attach `structuredItems` to success payload. |
| Action types | `app/actions/parse.actions.ts` (or shared type file) | Extend ParsedRecipeDraft return type to include optional `structuredItems?: StructuredItem[]` (or a type that the client can map to StructuredItem). |
| Frontend | `components/recipes/new-recipe-workflow.tsx` | When applying URL import result, if `structuredItems` present, use it for `prefillStructuredItems` and skip suggestIngredientMappings + buildStructuredItemsFromImport. |
| Logging | `lib/log-llm.ts` | No change if `logLlmRequest` already supports a new context string. |

---

## Success criteria

- User pastes a recipe URL that parses successfully.
- If OpenAI is configured and returns valid data: the new recipe form is prefilled with title, metadata, instructions, and **structured ingredient rows** (quantity, unit, ingredient name or suggested create name) without an extra round-trip or heuristic-only parsing.
- If OpenAI is not configured or returns invalid data: current behavior is unchanged (draft + suggestIngredientMappings + heuristic structured parse).
- All LLM output is validated with Zod and never trusted raw; catalog and IDs are scoped to the current user.

---

## Summary

Use a **single OpenAI call** that takes the URL-derived draft plus the user’s ingredient catalog and returns the same recipe plus a **structured ingredient array** matching the new recipe form. Integrate this in the parse action (Option A) and have the new recipe workflow use `structuredItems` when present, with a safe fallback to the existing mapping + heuristic pipeline.
