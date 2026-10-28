ALTER TABLE `Order` ADD `customerName` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `customerContact` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `dueDate` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `dueTime` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `fulfillmentMethod` text DEFAULT 'PICKUP' NOT NULL;--> statement-breakpoint
ALTER TABLE `Order` ADD `deliveryAddress` text;--> statement-breakpoint
ALTER TABLE `Order` ADD `status` text DEFAULT 'DRAFT' NOT NULL;