#!/usr/bin/env bash
# Idempotent bootstrap for the Pantry Plan Cloud Agent development environment.
# Runs after the repository is checked out. Safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure pnpm is available (repo pins pnpm via the "packageManager" field).
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi
corepack prepare --activate 2>/dev/null || true

# Install dependencies from the committed lockfile.
pnpm install --frozen-lockfile

# Generate Cloudflare Worker runtime types (worker-configuration.d.ts).
# This file is gitignored but required for type-checking (`astro check`) and
# for the "cloudflare:workers" module used across pages/actions.
pnpm cf-typegen

# Create local secrets for wrangler if they don't already exist.
# AUTH_SECRET only needs to be a stable random value for local Better Auth
# sessions; regenerating it would invalidate existing local sessions, so we
# only create the file when it is missing.
if [ ! -f .dev.vars ]; then
  AUTH_SECRET="$(openssl rand -base64 32)"
  cat > .dev.vars <<EOF
AUTH_SECRET="${AUTH_SECRET}"
AUTH_URL="http://localhost:4321"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
EOF
  echo "Created .dev.vars with a generated AUTH_SECRET."
else
  echo ".dev.vars already exists; leaving it untouched."
fi

# Apply D1 migrations to the local (miniflare) database.
pnpm db:migrate:local

echo "Pantry Plan environment setup complete."
