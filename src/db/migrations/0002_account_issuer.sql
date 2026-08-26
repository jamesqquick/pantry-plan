ALTER TABLE `account` ADD `issuer` text NOT NULL DEFAULT 'local:credential';
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_account_id_key` ON `account` (`issuer`,`accountId`);
