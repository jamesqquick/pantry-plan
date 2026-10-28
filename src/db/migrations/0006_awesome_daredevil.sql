PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_RecipeIngredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipeId` text NOT NULL,
	`ingredientId` text,
	`quantity` real NOT NULL,
	`rawQuantityText` text,
	`unit` text NOT NULL,
	`displayText` text NOT NULL,
	`rawText` text,
	`sortOrder` integer NOT NULL,
	`originalQuantity` real,
	`originalUnit` text,
	`weightGrams` real,
	`conversionSource` text,
	`conversionConfidence` text,
	`conversionNotes` text,
	`parseConfidence` real,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_RecipeIngredient`("id", "recipeId", "ingredientId", "quantity", "rawQuantityText", "unit", "displayText", "rawText", "sortOrder", "originalQuantity", "originalUnit", "weightGrams", "conversionSource", "conversionConfidence", "conversionNotes", "parseConfidence", "createdAt", "updatedAt") SELECT "id", "recipeId", "ingredientId", "quantity", "rawQuantityText", "unit", "displayText", "rawText", "sortOrder", "originalQuantity", "originalUnit", "weightGrams", "conversionSource", "conversionConfidence", "conversionNotes", "parseConfidence", "createdAt", "updatedAt" FROM `RecipeIngredient`;--> statement-breakpoint
DROP TABLE `RecipeIngredient`;--> statement-breakpoint
ALTER TABLE `__new_RecipeIngredient` RENAME TO `RecipeIngredient`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `RecipeIngredient_recipeId_sortOrder_idx` ON `RecipeIngredient` (`recipeId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `RecipeIngredient_ingredientId_idx` ON `RecipeIngredient` (`ingredientId`);