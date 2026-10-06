CREATE TABLE `RecipeSearchIndex` (
	`recipeId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`itemId` text,
	`contentHash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`indexedAt` integer,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `RecipeSearchIndex_userId_status_idx` ON `RecipeSearchIndex` (`userId`,`status`);