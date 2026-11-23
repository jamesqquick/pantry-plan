CREATE TABLE `Material` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`usageUnit` text NOT NULL,
	`packageQuantity` real NOT NULL,
	`packagePriceCents` integer NOT NULL,
	`supplier` text,
	`productUrl` text,
	`notes` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Material_userId_name_idx` ON `Material` (`userId`,`name`);--> statement-breakpoint
CREATE TABLE `OrderMaterial` (
	`id` text PRIMARY KEY NOT NULL,
	`orderId` text NOT NULL,
	`materialId` text NOT NULL,
	`name` text NOT NULL,
	`usageUnit` text NOT NULL,
	`unitCostCents` real NOT NULL,
	`quantity` real NOT NULL,
	`supplier` text,
	`productUrl` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`materialId`) REFERENCES `Material`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `OrderMaterial_orderId_materialId_key` ON `OrderMaterial` (`orderId`,`materialId`);--> statement-breakpoint
CREATE INDEX `OrderMaterial_materialId_idx` ON `OrderMaterial` (`materialId`);