-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "baseIngredientId" TEXT;

-- CreateIndex
CREATE INDEX "Ingredient_baseIngredientId_idx" ON "Ingredient"("baseIngredientId");
