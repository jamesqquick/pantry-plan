UPDATE `Order` SET `totalCostCents` = 0 WHERE `totalCostCents` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_Order` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text,
	`notes` text,
	`totalCostCents` integer DEFAULT 0 NOT NULL,
	`customerName` text,
	`customerContact` text,
	`dueDate` text,
	`dueTime` text,
	`fulfillmentMethod` text DEFAULT 'PICKUP' NOT NULL,
	`deliveryAddress` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_Order`("id", "userId", "name", "notes", "totalCostCents", "customerName", "customerContact", "dueDate", "dueTime", "fulfillmentMethod", "deliveryAddress", "status", "createdAt", "updatedAt") SELECT "id", "userId", "name", "notes", "totalCostCents", "customerName", "customerContact", "dueDate", "dueTime", "fulfillmentMethod", "deliveryAddress", "status", "createdAt", "updatedAt" FROM `Order`;--> statement-breakpoint
DROP TABLE `Order`;--> statement-breakpoint
ALTER TABLE `__new_Order` RENAME TO `Order`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `Order_userId_updatedAt_idx` ON `Order` (`userId`,`updatedAt`);
