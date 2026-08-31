CREATE TABLE `ai_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`proposalType` varchar(40) NOT NULL,
	`prompt` text NOT NULL,
	`content` text NOT NULL,
	`status` enum('pending','applied','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `ai_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`tileSize` int NOT NULL DEFAULT 16,
	`sourceUrl` text,
	`analysis` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_blueprints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`biome` varchar(80) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`payload` text NOT NULL,
	`status` enum('draft','ready','exported') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `map_blueprints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qa_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL,
	`category` varchar(60) NOT NULL,
	`message` text NOT NULL,
	`recordId` int,
	`resolved` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qa_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`geminiApiKeyEncrypted` text,
	`geminiKeyLastTestedAt` timestamp,
	`geminiKeyStatus` enum('not_configured','untested','valid','invalid') NOT NULL DEFAULT 'not_configured',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `world_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`status` enum('canonical','draft','archived') NOT NULL DEFAULT 'canonical',
	`summary` text,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `world_records_id` PRIMARY KEY(`id`)
);
