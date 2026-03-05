# UI Guidelines — Brand-Aligned Component System

**Brand:** "Turn your recipes into a system. Organize, scale, and execute with clarity."  
**Vibe:** Structured, calm, modern, warm, professional (not corporate, not playful).

This doc is the single source of truth for UI implementation. All components and pages must follow these rules.

---

## 1. Token usage (colors)

- **No raw hex or palette classes in components.** Use only semantic tokens from `app/globals.css` (exposed via Tailwind `@theme`).
- **Do not use:** `zinc-*`, `slate-*`, `gray-*`, `red-600`, `green-500`, `amber-600`, or any `#...` in classNames.
- **Use instead:**

| Intent | Utility |
|--------|--------|
| Page/shell background | `bg-background` |
| Main text | `text-foreground` |
| Secondary/help text | `text-muted-foreground` |
| Cards | `bg-card text-card-foreground border border-border` |
| Panels (totals, summary) | `bg-panel text-panel-foreground border border-border` |
| Inputs | `border-input bg-background text-foreground placeholder:text-muted-foreground` |
| Borders / dividers | `border-border` or `bg-divider` (for `<hr>`) |
| Popovers / dropdowns | `bg-popover text-popover-foreground border-border` |
| Primary actions | `bg-primary text-primary-foreground hover:bg-primary/90` |
| Secondary/ghost | `bg-muted`, `hover:bg-muted`, `hover:bg-accent hover:text-accent-foreground` |
| Errors | `text-destructive`, `bg-destructive/15`, `border-destructive` |
| Success | `text-success`, `bg-success/15` |
| Warning | `text-warning`, `bg-warning/15` |

- **Neutrals dominate (70–80%).** Primary for key actions only (10–15%). Accent sparingly (&lt;5%). Keep status colors muted (e.g. `bg-success/15` not solid green).

---

## 2. Spacing (8pt scale)

Use a consistent 8pt-based scale. Prefer these values:

- **Padding:** `p-2`, `p-4`, `p-6`, `p-8` (cards: default `p-4`, primary sections `p-6`).
- **Gaps:** `gap-2`, `gap-4`, `gap-6`.
- **Vertical spacing:** `space-y-2`, `space-y-4`, `space-y-6`.
- **Form fields:** `space-y-1.5` between label, control, and help/error.
- **Section separation:** `space-y-6` or `mb-6` on section headers.
- **List rows:** `py-2` or `py-3`; list gaps `gap-2` (tight) or `gap-4` (medium).

Avoid arbitrary values (e.g. `p-3`, `gap-3`) unless matching an existing 8pt value (e.g. `py-3` for 12px).

---

## 3. Component defaults

| Element | Rule |
|--------|------|
| **Cards** | `rounded-lg border border-border bg-card`; padding `p-4` or `p-6`. |
| **Inputs / buttons** | `rounded-md`. |
| **Chips / badges** | `rounded-full` only where appropriate (pills); otherwise `rounded-md`. |
| **Borders** | Default `border border-border`. Dividers: `<hr className="border-0 h-px bg-divider" />` or `divide-y divide-border`. |
| **Shadows** | Prefer none or subtle `shadow-sm`; avoid heavy shadows. |

---

## 4. Typography

- **Page title:** `text-2xl font-semibold text-foreground`.
- **Section heading:** `text-lg font-medium text-foreground` or `text-base font-semibold text-foreground`.
- **Labels:** `text-sm font-medium text-foreground`.
- **Help / secondary:** `text-sm text-muted-foreground` or `text-xs text-muted-foreground`.
- **Body:** `text-foreground`; use `text-muted-foreground` for supporting text.

Avoid random font sizes or weights; stick to this hierarchy.

---

## 5. Interaction states

- **Focus (keyboard):**  
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- **Hover:**  
  - Buttons (primary): `hover:bg-primary/90`.  
  - Ghost/outline/list rows: `hover:bg-muted`.  
  - Links: `hover:text-foreground` with base `text-muted-foreground`.
- **Disabled:** `disabled:pointer-events-none disabled:opacity-50` (or rely on Button/Input built-ins).
- **Invalid/error:** `aria-invalid` on controls; `border-destructive` and `focus-visible:ring-destructive/20` on inputs.

Do not use `focus:ring-offset-zinc-900` or other raw neutrals for ring offset; use `ring-offset-background`.

---

## 6. Primitives (prefer over one-off styling)

Use these from `@/components/primitives`:

- **PageContainer** — Max width + page padding (`mx-auto max-w-5xl px-4 py-6`).
- **SectionHeader** — Title + optional subtitle + optional action; 8pt spacing, tokens.
- **CardShell** — Card surface with `rounded-lg border border-border bg-card`, padding `p-4` or `p-6`.
- **FormField** — Label + control slot + optional help + error; `space-y-1.5`, token-based labels/help/error.
- **TotalsPanel** — Summary block with `bg-panel`, `border-border`, muted title and key-value rows.
- **Divider** — `<hr>` with `bg-divider`.

Import from `@/components/primitives` (see `components/primitives/index.ts`).

---

## 7. Examples (correct usage)

**Back link:**
```tsx
<Link href="/recipes" className="inline-block text-sm text-muted-foreground hover:text-foreground">
  ← Back to recipes
</Link>
```

**Page heading:**
```tsx
<h1 className="text-2xl font-semibold text-foreground">Recipes</h1>
<p className="mt-1 text-sm text-muted-foreground">Manage your recipe library.</p>
```

**Form label + error:**
```tsx
<label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground">Name</label>
<Input id="name" />
<p className="mt-1 text-sm text-destructive" role="alert">{error}</p>
```

**List container:**
```tsx
<ul className="divide-y divide-border rounded-lg border border-border bg-card">
  <li className="px-4 py-3 text-foreground hover:bg-muted">...</li>
</ul>
```

**Status alert:**
```tsx
<div className="rounded-md border border-border bg-success/15 px-4 py-3 text-sm text-success" role="status">
  Saved.
</div>
```

---

## 8. Visual regression

Use the **UI Showcase** page to verify consistency:

- **Route:** `/dev/ui-showcase` (under app layout; requires auth).
- **Contents:** Primitives, buttons (all variants + disabled), inputs (default/focus/error), cards, TotalsPanel, badges, status alerts, ingredient-row sample, empty/loading states.

Open this page after theme or component changes to ensure no regressions.

---

## 9. References

- **Tokens and mapping:** `docs/ui-tokens.md`
- **Audit and checklist:** `docs/ui-audit.md`
- **Theme source:** `app/globals.css` (HSL variables + `@theme`)
