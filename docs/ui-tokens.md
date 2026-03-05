# UI Token System — Component Mapping Guide

Brand: *"Turn your recipes into a system. Organize, scale, and execute with clarity."*  
Vibe: **structured, calm, modern, warm, professional** (not corporate, not playful).

All theme tokens are defined in `app/globals.css` as HSL CSS variables and exposed to Tailwind via `@theme`. Use **tokens only** in components—no raw hex or hard-coded colors.

---

## Rules

- **No raw hex in components.** Use semantic utilities only (e.g. `bg-primary`, `text-muted-foreground`).
- **Accent usage &lt;5% of UI.** Reserve accent for a few highlights (e.g. one CTA, tags); neutrals dominate.
- **Neutrals dominate.** Prefer background, muted, border, and foreground for a calm UI.
- **Prefer subtle contrast and whitespace** over strong color blocks.

---

## Token → Utility Mapping

| Use case | Tailwind utilities |
|----------|--------------------|
| **App background** | `bg-background text-foreground` |
| **Cards** | `bg-card text-card-foreground border border-border` |
| **Panels (totals / summary blocks)** | `bg-panel text-panel-foreground border border-border` |
| **Primary buttons** | `bg-primary text-primary-foreground hover:bg-primary/90` |
| **Secondary buttons** | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| **Outline buttons** | `border border-border bg-background hover:bg-muted` |
| **Inputs** | `border border-input bg-background placeholder:text-muted-foreground` |
| **Focus rings** | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| **Dividers** | `bg-divider` (e.g. `h-px bg-divider`) |
| **Alerts / callouts** | Use semantic tokens with subtle backgrounds, e.g. `bg-success/15 text-success`, `bg-warning/15 text-warning`, `bg-info/15 text-info`, `bg-destructive/15 text-destructive` |

---

## Snippets

**Page shell:**
```html
<div className="min-h-screen bg-background text-foreground">
  ...
</div>
```

**Card with border:**
```html
<div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
  ...
</div>
```

**Totals / summary panel:**
```html
<section className="rounded-lg border border-border bg-panel p-4 text-panel-foreground">
  <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
  <p className="mt-1">...</p>
</section>
```

**Primary button:**
```html
<button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
  Save
</button>
```

**Input with focus and placeholder:**
```html
<input
  className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  placeholder="Enter value"
/>
```

**Divider line:**
```html
<hr className="h-px border-0 bg-divider" />
```

**Success callout:**
```html
<div className="rounded-md bg-success/15 px-3 py-2 text-sm text-success">
  All set.
</div>
```

---

## Available semantic colors

- **Core:** `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`
- **Actions:** `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`
- **Surfaces:** `muted`, `muted-foreground`, `border`, `input`, `ring`
- **Extended:** `panel`, `panel-foreground`, `divider`, `success`, `success-foreground`, `warning`, `warning-foreground`, `info`, `info-foreground`

Use them as: `bg-<token>`, `text-<token>`, `border-<token>`, and with opacity: `bg-primary/90`, `bg-success/15`, etc.

---

## Dark mode

Dark mode is driven by the **`.dark`** class (shadcn pattern). Add `class="dark"` to the root `<html>` to switch to dark tokens. The same utilities apply; variable values switch automatically (e.g. `bg-background` becomes the dark background when `.dark` is present).
