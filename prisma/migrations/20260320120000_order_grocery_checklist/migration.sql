-- CreateTable
CREATE TABLE "OrderGroceryCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderGroceryCheck_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrderGroceryCheck_orderId_idx" ON "OrderGroceryCheck"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderGroceryCheck_orderId_ingredientId_key" ON "OrderGroceryCheck"("orderId", "ingredientId");
