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
CREATE TABLE `__new_OrderItem` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`recipeId` text NOT NULL,
	`batches` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `__new_Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipeId`) REFERENCES `Recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_Order`("id", "userId", "name", "notes", "totalCostCents", "customerName", "customerContact", "dueDate", "dueTime", "fulfillmentMethod", "deliveryAddress", "status", "createdAt", "updatedAt") SELECT "id", "userId", "name", "notes", COALESCE("totalCostCents", 0), "customerName", "customerContact", "dueDate", "dueTime", "fulfillmentMethod", "deliveryAddress", "status", "createdAt", "updatedAt" FROM `Order`;
--> statement-breakpoint
INSERT INTO `__new_OrderItem`("id", "orderId", "recipeId", "batches", "createdAt", "updatedAt") SELECT "id", "orderId", "recipeId", "batches", "createdAt", "updatedAt" FROM `OrderItem`;
--> statement-breakpoint
DROP TABLE `OrderItem`;
--> statement-breakpoint
DROP TABLE `Order`;
--> statement-breakpoint
ALTER TABLE `__new_Order` RENAME TO `Order`;
--> statement-breakpoint
ALTER TABLE `__new_OrderItem` RENAME TO `OrderItem`;
--> statement-breakpoint
CREATE INDEX `Order_userId_updatedAt_idx` ON `Order` (`userId`,`updatedAt`);
--> statement-breakpoint
CREATE UNIQUE INDEX `OrderItem_orderId_recipeId_key` ON `OrderItem` (`orderId`,`recipeId`);
--> statement-breakpoint
CREATE INDEX `OrderItem_orderId_idx` ON `OrderItem` (`orderId`);
