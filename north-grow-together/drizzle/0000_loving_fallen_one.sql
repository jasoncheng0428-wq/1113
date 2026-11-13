CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`branch` text
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`branch` text NOT NULL,
	`profile` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
