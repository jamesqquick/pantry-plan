CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`idToken` text,
	`password` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_key` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'USER' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_key` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`baseIngredientId` text,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`category` text,
	`subcategory` text DEFAULT '' NOT NULL,
	`defaultUnit` text,
	`costBasisUnit` text NOT NULL,
	`estimatedCentsPerBasisUnit` real,
	`gramsPerCup` real,
	`conversionConfidence` text DEFAULT 'Medium' NOT NULL,
	`costConfidence` text DEFAULT 'Medium' NOT NULL,
	`cupsPerEach` real,
	`preferredDisplayUnit` text DEFAULT 'AUTO' NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`baseIngredientId`) REFERENCES `Ingredient`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Ingredient_userId_normalizedName_key` ON `Ingredient` (`userId`,`normalizedName`);--> statement-breakpoint
CREATE INDEX `Ingredient_userId_idx` ON `Ingredient` (`userId`);--> statement-breakpoint
CREATE INDEX `Ingredient_baseIngredientId_idx` ON `Ingredient` (`baseIngredientId`);--> statement-breakpoint
CREATE INDEX `Ingredient_category_idx` ON `Ingredient` (`category`);--> statement-breakpoint
CREATE INDEX `Ingredient_category_subcategory_idx` ON `Ingredient` (`category`,`subcategory`);--> statement-breakpoint
CREATE TABLE `IngredientAlias` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredientId` text NOT NULL,
	`aliasNormalized` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `IngredientAlias_aliasNormalized_key` ON `IngredientAlias` (`aliasNormalized`);--> statement-breakpoint
CREATE INDEX `IngredientAlias_ingredientId_idx` ON `IngredientAlias` (`ingredientId`);--> statement-breakpoint
CREATE TABLE `IngredientCategory` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `IngredientCategory_name_key` ON `IngredientCategory` (`name`);--> statement-breakpoint
CREATE INDEX `IngredientCategory_name_idx` ON `IngredientCategory` (`name`);--> statement-breakpoint
CREATE TABLE `IngredientSubcategory` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ingredientCategoryId` text NOT NULL,
	FOREIGN KEY (`ingredientCategoryId`) REFERENCES `IngredientCategory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `IngredientSubcategory_categoryId_name_key` ON `IngredientSubcategory` (`ingredientCategoryId`,`name`);--> statement-breakpoint
CREATE INDEX `IngredientSubcategory_categoryId_idx` ON `IngredientSubcategory` (`ingredientCategoryId`);--> statement-breakpoint
CREATE TABLE `Recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`sourceUrl` text,
	`imageUrl` text,
	`servings` integer,
	`prepTimeMinutes` integer,
	`cookTimeMinutes` integer,
	`totalTimeMinutes` integer,
	`notes` text,
	`lastViewedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Recipe_userId_idx` ON `Recipe` (`userId`);--> statement-breakpoint
CREATE INDEX `Recipe_userId_lastViewedAt_idx` ON `Recipe` (`userId`,`lastViewedAt`);--> statement-breakpoint
CREATE TABLE `RecipeIngredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipeId` text NOT NULL,
	`ingredientId` text,
	`quantity` real,
	`rawQuantityText` text,
	`unit` text,
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
CREATE INDEX `RecipeIngredient_recipeId_sortOrder_idx` ON `RecipeIngredient` (`recipeId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `RecipeIngredient_ingredientId_idx` ON `RecipeIngredient` (`ingredientId`);--> statement-breakpoint
CREATE TABLE `RecipeInstruction` (
	`id` text PRIMARY KEY NOT NULL,
	`recipeId` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `RecipeInstruction_recipeId_sortOrder_idx` ON `RecipeInstruction` (`recipeId`,`sortOrder`);--> statement-breakpoint
CREATE TABLE `RecipeTag` (
	`id` text PRIMARY KEY NOT NULL,
	`recipeId` text NOT NULL,
	`tagId` text NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `RecipeTag_recipeId_tagId_key` ON `RecipeTag` (`recipeId`,`tagId`);--> statement-breakpoint
CREATE INDEX `RecipeTag_tagId_idx` ON `RecipeTag` (`tagId`);--> statement-breakpoint
CREATE TABLE `Tag` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Tag_userId_name_key` ON `Tag` (`userId`,`name`);--> statement-breakpoint
CREATE INDEX `Tag_userId_idx` ON `Tag` (`userId`);--> statement-breakpoint
CREATE TABLE `Order` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text,
	`notes` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Order_userId_updatedAt_idx` ON `Order` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `OrderItem` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`recipeId` text NOT NULL,
	`batches` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OrderItem_orderId_recipeId_key` ON `OrderItem` (`orderId`,`recipeId`);--> statement-breakpoint
CREATE INDEX `OrderItem_orderId_idx` ON `OrderItem` (`orderId`);--> statement-breakpoint
CREATE TABLE `PlannedMeal` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`date` integer NOT NULL,
	`mealSlot` text NOT NULL,
	`recipeId` text,
	`customLabel` text,
	`servings` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `PlannedMeal_userId_date_idx` ON `PlannedMeal` (`userId`,`date`);