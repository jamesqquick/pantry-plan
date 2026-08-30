# Quick Pantry

Quick Pantry keeps your recipes, weekly meals, and grocery shopping in one place.

[Open Quick Pantry](https://quickpantry.app)

## What You Can Do

### Import recipes

Add recipes from a URL, from a cookbook or recipe photo when photo import is
available, or by entering one manually. Review the imported draft before saving
it to your collection.

### Organize your recipes

Browse and search your saved recipes, filter them with tags, view ingredients
and instructions, and edit, duplicate, or delete recipes.

### Plan your week

Use the weekly meal plan to assign recipes to meals and move or edit planned
meals as your week changes.

### Build a grocery list

Create an order from selected recipes and batch sizes. Quick Pantry combines the
ingredients into a grocery list, converts compatible units, and estimates the
cost for each batch.

### Manage your kitchen

Maintain your ingredient catalog and manage your account from Profile. Profile
settings include your name, password, connected Google account, and integrations.

### Reset your password

Use [Forgot password](https://quickpantry.app/forgot-password) to receive a
reset link by email. Transactional email is sent from `noreply@quickpantry.app`.

## Getting Started

1. [Create an account](https://quickpantry.app/register) or [sign in](https://quickpantry.app/login).
2. Add your first recipe from a URL, a photo if the option is available, or manual entry.
3. Review and save the recipe.
4. Add recipes to a week in **Meal plan**.
5. Create an order to generate your grocery list and cost estimate.

Your recipes, ingredients, meal plans, and orders are private to your account.

## Install on iPhone

1. Open [Quick Pantry](https://quickpantry.app) in Safari.
2. Tap the **Share** button.
3. Select **Add to Home Screen**, then tap **Add**.

The first PWA release requires a network connection to load live recipes, meal
plans, orders, grocery lists, and edits. If the connection is unavailable,
Quick Pantry shows an offline message until you reconnect.

## AI-Powered Import

Recipe URLs are parsed for structured recipe data, while photo-based recipe
extraction uses Cloudflare Workers AI. Import features include clear error and
loading states, and expensive import requests are rate limited. Photo import
may be enabled selectively, so the **From photo** option is not guaranteed to
appear for every account.

## MCP Integration

Quick Pantry can connect to AI clients that support the Model Context Protocol
(MCP). To configure access:

1. Sign in and open **Profile**.
2. Create a named MCP key for the client you want to connect.
3. Copy the key immediately. Quick Pantry cannot show it again.
4. Configure the client with the MCP endpoint and bearer token.

The hosted MCP endpoint is:

```text
https://quickpantry.app/mcp
```

Each key authenticates access to your own Quick Pantry account. You can revoke
keys from Profile at any time. Treat MCP keys like passwords.

The current MCP tools are:

- `create_recipe` creates a recipe in your account.
- `import_recipe_from_url` fetches and saves a recipe from a URL.
- `search_recipes` searches your recipes by title.
- `create_weekly_meal_plan` replaces a week with saved recipe IDs. Use
  `search_recipes` and `create_recipe` first when a recipe is not already saved.

## For Contributors

Quick Pantry is an Astro application deployed to Cloudflare Workers.

### Stack

- Astro 6 with server-rendered pages and React islands
- Cloudflare Workers with D1, KV sessions, Workers AI, feature flags, and Email Sending
- Drizzle ORM for database access
- Better Auth for email/password and Google account authentication
- Tailwind CSS v4
- Vitest and Zod

### Prerequisites

- Node.js `>=22.12.0`
- pnpm `10.11.1`

### Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

The development server runs on `http://localhost:4321` by default. Fill in the
local values in `.dev.vars` before using authenticated or AI-backed features.
For Google sign-in locally, configure `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`.

Production email uses the `EMAIL` Cloudflare Email Sending binding and the
onboarded `quickpantry.app` domain. Local development keeps using the remote
Email Sending binding from `wrangler.jsonc`.
