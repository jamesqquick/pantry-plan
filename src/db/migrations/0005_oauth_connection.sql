CREATE TABLE `oauthConnection` (
	`userId` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
