ALTER TABLE `Recipe` ADD `isPublic` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `Recipe` ADD `publicSlug` text;--> statement-breakpoint
ALTER TABLE `Recipe` ADD `publishedAt` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `Recipe_publicSlug_key` ON `Recipe` (`publicSlug`);