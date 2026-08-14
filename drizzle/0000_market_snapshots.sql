CREATE TABLE IF NOT EXISTS `market_snapshots` (
	`symbol` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`market_date` text,
	`updated_at` text NOT NULL,
	`refresh_cycle` text NOT NULL
);
