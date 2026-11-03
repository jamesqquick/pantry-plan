PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_MutationOperation` (
	`userId` text NOT NULL,
	`operationId` text NOT NULL,
	`kind` text NOT NULL,
	`requestHash` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`resourceId` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`userId`, `operationId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_MutationOperation`("userId", "operationId", "kind", "requestHash", "status", "resourceId", "createdAt") SELECT "userId", "operationId", "kind", "requestHash", 'completed', "resourceId", "createdAt" FROM `MutationOperation`;--> statement-breakpoint
DROP TABLE `MutationOperation`;--> statement-breakpoint
ALTER TABLE `__new_MutationOperation` RENAME TO `MutationOperation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
