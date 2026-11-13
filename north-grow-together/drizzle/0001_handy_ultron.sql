CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`branch` text,
	`detail` text NOT NULL,
	`created` text NOT NULL
);
