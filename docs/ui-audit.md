# UI Audit — Brand Alignment & Token System

**Brand:** "Turn your recipes into a system. Organize, scale, and execute with clarity."  
**Vibe:** Structured, calm, modern, warm, professional.  
**Scope:** All UI in `components/`, `app/` (pages/layouts).  
**Status:** Inventory complete; refactor in progress.

---

## Summary: Top 10 Issues (Highest ROI)

| # | Issue | Impact | Location pattern |
|---|--------|--------|-------------------|
| 1 | **Raw zinc/slate/gray everywhere** | Breaks token-only rule; inconsistent with theme | 30+ files: labels, borders, inputs, lists, nav |
| 2 | **Raw red/green/amber for errors and status** | Loud; not muted tokens | `text-red-600`, `bg-green-50`, `text-amber-600` in forms, toasts, alerts |
| 3 | **Custom inputs/selects not using UI tokens** | Inconsistent focus and borders | ingredient-form, ingredient-list, recipe-list-client, QuantityInput, import-wizard |
| 4 | **App layout and header use zinc/white** | Page chrome not themed | `app/(app)/layout.tsx`: bg-zinc-50, bg-white, border-zinc-* |
| 5 | **Toast uses raw green/red** | Status not using success/destructive tokens | `components/ui/toast.tsx` |
| 6 | **Button danger uses `text-white`** | Should use `text-destructive-foreground` | `components/ui/button.tsx` |
| 7 | **Card uses `rounded-xl` and no `border-border`** | Radius and border not aligned to guidelines | `components/ui/card.tsx` |
| 8 | **SectionHeader uses zinc** | Primitive not token-based | `components/ui/section-header.tsx` |
| 9 | **Dropdowns/popovers use zinc/slate** | Menus not popover tokens | recipe-tag-picker, import-ingredient-picker |
| 10 | **Inconsistent focus ring** | Some use ring-1/ring-zinc-500 instead of ring-2 ring-ring ring-offset-2 | recipe-list-client, ingredient-list, several forms |

---

## Component Inventory & Issues

| Component | Location | Usage | Issues |
|-----------|----------|--------|--------|
| **Button** | components/ui/button.tsx | Global | (E) danger uses `text-white`; (E) focus uses ring-[3px] — confirm vs ring-2 |
| **Input** | components/ui/input.tsx | Forms | Token-based; OK. |
| **Textarea** | components/ui/textarea.tsx | Forms | Token-based; OK. |
| **Card** | components/ui/card.tsx | Layouts, forms | (D) rounded-xl → rounded-lg; (A) add border-border |
| **Toast** | components/ui/toast.tsx | Global | (A) raw green/red → bg-success/15, bg-destructive/15, text-success, text-destructive |
| **Select** | components/ui/select.tsx | Forms | Token-based; OK. |
| **SectionHeader** | components/ui/section-header.tsx | Pages | (A) text-zinc-900 → text-foreground |
| **Label** | components/ui/label.tsx | Forms | Check for zinc. |
| **Skeleton** | components/ui/skeleton.tsx | Loading | Check for zinc. |
| **Icons** | components/ui/icons.tsx | Global | Check icon button classes. |
| **IngredientEditorRow** | components/recipes/ingredient-editor-row.tsx | Recipe edit, import | (A) zinc labels, borders, red error; (E) focus on inputs |
| **IngredientMappingTable** | components/recipes/import/ingredient-mapping-table.tsx | Import | (A) amber, zinc; (B) spacing |
| **SmartQuantityInput** | components/forms/smart-quantity-input.tsx | Ingredients | (A) red error → text-destructive |
| **RecipeListClient** | components/recipes/recipe-list-client.tsx | Recipes page | (A) zinc headings, select, empty state; (E) focus ring |
| **IngredientList** | components/ingredients/ingredient-list.tsx | Ingredients page | (A) zinc throughout; (E) focus/hover; (B) list padding |
| **IngredientForm** | components/ingredients/ingredient-form.tsx | Ingredient edit | (A) zinc labels, inputs, red error; (E) focus ring |
| **IngredientPicker** | components/recipes/ingredient-picker.tsx | Recipe form | (A) zinc input; (E) focus |
| **OrderItemsEditor** | components/orders/order-items-editor.tsx | Orders | (A) zinc labels, input, red error |
| **QuantityInput** | components/QuantityInput.tsx | Legacy | (A) zinc inputs; (E) focus |
| **IngredientDisplayPreferenceForm** | components/ingredients/ingredient-display-preference-form.tsx | Ingredient edit | (A) zinc description, label, select, red |
| **RecipeTagPicker** | components/recipes/recipe-tag-picker.tsx | Recipe form, import | (A) zinc/slate dropdown, label, chips; (A) red error |
| **ImportWizard** | components/recipes/import/import-wizard.tsx | New recipe | (A) zinc headings, labels, file input, borders, red; (B) spacing |
| **ResetPasswordForm** | components/forms/reset-password-form.tsx | Auth | (A) zinc labels, red errors |
| **OrderForm** | components/orders/order-form.tsx | Orders | (A) zinc labels, red, border-t zinc |
| **RecipeForm** | components/forms/recipe-form.tsx | Recipe edit | (A) zinc labels, red errors |
| **ImportIngredientPicker** | components/recipes/import/import-ingredient-picker.tsx | Import | (A) slate dropdown hover |
| **RecipeListRecipeCard** | components/recipes/recipe-list-recipe-card.tsx | Recipes list | (E) focus ring-offset-zinc-900 → ring-offset-background |
| **App layout** | app/(app)/layout.tsx | All app pages | (A) bg-zinc-50, bg-white, border-zinc; (B) max-width/padding |
| **Orders page** | app/(app)/orders/page.tsx | Orders list | (A) zinc headings, list, borders |
| **Ingredients page** | app/(app)/ingredients/page.tsx | Ingredients | (A) h1 zinc |
| **TotalsPanel (example)** | components/examples/TotalsPanel.tsx | Reference | Token-based; OK. |
| **CalmField (example)** | components/examples/CalmField.tsx | Reference | Token-based; OK. |

**Issue key:** (A) Color, (B) Spacing, (C) Typography, (D) Radius, (E) Interaction, (F) Variants.

---

## Before / After Guidelines

### Colors
- **Before:** `bg-white`, `bg-zinc-*`, `text-zinc-*`, `border-zinc-*`, `text-red-600`, `bg-green-50`, `text-amber-600`, `slate-*`.  
- **After:** `bg-background`, `bg-card`, `bg-panel`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-destructive`, `bg-destructive/15`, `bg-success/15`, `bg-warning/15`, `bg-info/15`. Labels: `text-foreground` or keep medium weight with token.

### Spacing (8pt scale)
- **Before:** Mixed padding (p-2, p-3, px-4 py-3, etc.).  
- **After:** Cards `p-4` or `p-6`; sections `space-y-4` or `space-y-6`; form rows `space-y-2`; lists `gap-2` / `gap-4`; consistent `px-4 py-2` for list rows.

### Typography
- **Before:** Mixed text-sm/text-base, font-medium/font-semibold on labels.  
- **After:** Page title `text-2xl font-semibold text-foreground`; section title `text-base font-semibold text-foreground`; labels `text-sm font-medium text-foreground`; help/muted `text-sm text-muted-foreground`.

### Radius
- **Before:** Cards rounded-xl, mixed rounded-md/rounded-lg.  
- **After:** Cards/panels `rounded-lg`; inputs/buttons `rounded-md`; pills only where appropriate `rounded-full`.

### Borders & shadows
- **Before:** `border-zinc-200`, `divide-zinc-200`, no explicit border token.  
- **After:** `border border-border`; dividers `bg-divider` or `border-border`; avoid heavy shadows; subtle `shadow-sm` only if needed.

### Interaction
- **Before:** `focus:ring-1 focus:ring-zinc-500`, `hover:bg-zinc-50`, `dark:focus:ring-offset-zinc-900`.  
- **After:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`; hover `hover:bg-muted` or `hover:bg-accent`; `ring-offset-background`.

---

## Validation Checklist

- [ ] No raw hex in component classNames.
- [ ] No `zinc-*`, `slate-*`, `gray-*` (or other raw neutrals) in components; use tokens.
- [ ] Error/alert text uses `text-destructive`; success uses `text-success` / `bg-success/15`.
- [ ] All form labels use `text-foreground` or token; help text `text-muted-foreground`.
- [ ] All inputs/selects use `border-input`, `bg-background` (or transparent), focus `ring-ring`, `ring-offset-background`.
- [ ] Cards use `rounded-lg`, `border-border`, `bg-card`.
- [ ] App shell uses `bg-background`; header uses `border-border`, `bg-card` or `bg-background`.
- [ ] Buttons: primary/secondary/ghost use tokens; danger uses `text-destructive-foreground`.
- [ ] Toasts/alerts use muted status tokens (e.g. `bg-success/15 text-success`).
- [ ] Spacing uses 8pt scale (p-2, p-4, p-6, gap-2, gap-4, space-y-2, space-y-4, space-y-6).
- [ ] Section/page structure uses primitives where applicable (PageContainer, CardShell, SectionHeader, FormField, TotalsPanel, Divider).

---

## Resolved / Follow-ups (post-refactor)

**Resolved (refactor complete):**

- Replaced all `zinc-*`, `slate-*`, `gray-*` with tokens (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-background`, `bg-muted`, `bg-popover`, etc.) across components and app pages.
- Replaced raw `text-red-*`, `text-green-*`, `text-amber-*` with `text-destructive`, `text-success`, `text-warning` and muted backgrounds (`bg-destructive/15`, `bg-success/15`, etc.).
- Layout: `bg-background`, header `bg-card`/`border-border`, nav links `text-muted-foreground`/`hover:text-foreground`.
- Button danger: `text-destructive-foreground`; Card: `rounded-lg`, `border-border`; Toast: token-based success/destructive.
- SectionHeader, form labels, help text, error text: token-based across forms (recipe-form, order-form, reset-password-form, profile-form, login/register, import-wizard, etc.).
- Inputs/selects: `border-input`, `bg-background`, `text-foreground`, consistent focus-visible ring (`ring-ring`, `ring-offset-background`).
- Recipe list card, recipe view, ingredient list, orders, ingredients pages, user menu, dialogs, dropdowns: all aligned to tokens.
- Primitives added: SectionHeader, PageContainer, CardShell, FormField, TotalsPanel, Divider.
- UI showcase page added at `/dev/ui-showcase` for visual regression.

**Follow-ups (optional):**

- Consider migrating more pages to use PageContainer/SectionHeader/CardShell from primitives for consistency.
- If adding new shadcn components, ensure they use theme tokens (no zinc/slate) and match focus ring and radius rules.
- Run occasional grep for `zinc-|slate-|gray-[0-9]|text-red-|text-green-` in `.tsx`/`.css` to catch regressions.
