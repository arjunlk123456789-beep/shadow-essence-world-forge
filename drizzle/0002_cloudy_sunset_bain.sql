ALTER TABLE `map_blueprints` ADD `connectionIds` text DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `map_blueprints` ADD `exportFormat` varchar(20) DEFAULT 'tmx' NOT NULL;--> statement-breakpoint
ALTER TABLE `map_blueprints` ADD `tilesetName` varchar(120) DEFAULT 'shadow-essence-16px' NOT NULL;