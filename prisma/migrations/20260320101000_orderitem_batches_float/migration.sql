-- AlterTable
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

-- SQLite doesn't support ALTER COLUMN types directly.
ALTER TABLE "OrderItem" RENAME TO "OrderItem_old";

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "batches" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "OrderItem" ("id", "orderId", "recipeId", "batches", "createdAt", "updatedAt")
SELECT
  "id",
  "orderId",
  "recipeId",
  CAST("batches" AS REAL),
  "createdAt",
  "updatedAt"
FROM "OrderItem_old";

DROP TABLE "OrderItem_old";

-- Recreate indexes/constraints.
DROP INDEX IF EXISTS "OrderItem_orderId_idx";
DROP INDEX IF EXISTS "OrderItem_orderId_recipeId_key";

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE UNIQUE INDEX "OrderItem_orderId_recipeId_key" ON "OrderItem"("orderId", "recipeId");

COMMIT;
PRAGMA foreign_keys=on;

