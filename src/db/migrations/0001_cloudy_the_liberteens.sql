CREATE TABLE `McpApiKey` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`keyHash` text NOT NULL,
	`keyPrefix` text NOT NULL,
	`lastUsedAt` integer,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `McpApiKey_keyHash_key` ON `McpApiKey` (`keyHash`);--> statement-breakpoint
CREATE INDEX `McpApiKey_userId_idx` ON `McpApiKey` (`userId`);