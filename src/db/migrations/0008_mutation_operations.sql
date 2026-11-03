CREATE TABLE `MutationOperation` (
	`userId` text NOT NULL,
	`operationId` text NOT NULL,
	`kind` text NOT NULL,
	`requestHash` text NOT NULL,
	`resourceId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`userId`, `operationId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
