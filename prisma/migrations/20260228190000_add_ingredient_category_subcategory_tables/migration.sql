-- CreateTable
CREATE TABLE "IngredientCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "IngredientSubcategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ingredientCategoryId" TEXT NOT NULL,
    CONSTRAINT "IngredientSubcategory_ingredientCategoryId_fkey" FOREIGN KEY ("ingredientCategoryId") REFERENCES "IngredientCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "IngredientCategory_name_key" ON "IngredientCategory"("name");

-- CreateIndex
CREATE INDEX "IngredientCategory_name_idx" ON "IngredientCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientSubcategory_ingredientCategoryId_name_key" ON "IngredientSubcategory"("ingredientCategoryId", "name");

-- CreateIndex
CREATE INDEX "IngredientSubcategory_ingredientCategoryId_idx" ON "IngredientSubcategory"("ingredientCategoryId");
