-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "lastViewedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Recipe_userId_lastViewedAt_idx" ON "Recipe"("userId", "lastViewedAt");
