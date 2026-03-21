/**
 * Rewrites legacy costBasisUnit strings (GRAM→G, EACH→COUNT) on the live DB.
 * Run once when Prisma errors: Value 'GRAM' not found in enum 'CostBasisUnit'
 *
 *   npx tsx scripts/fix-legacy-cost-basis-units.ts
 *
 * Requires .env with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (same as `npm run dev`).
 */
import "dotenv/config";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const g = await db.$executeRawUnsafe(
    `UPDATE "Ingredient" SET "costBasisUnit" = 'G' WHERE "costBasisUnit" = 'GRAM'`,
  );
  const count = await db.$executeRawUnsafe(
    `UPDATE "Ingredient" SET "costBasisUnit" = 'COUNT' WHERE "costBasisUnit" = 'EACH'`,
  );
  console.log(`Updated GRAM→G: ${g} row(s), EACH→COUNT: ${count} row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
