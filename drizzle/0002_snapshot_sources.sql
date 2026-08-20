ALTER TABLE `stock_snapshots` ADD `price_source` text NOT NULL DEFAULT 'TOSS';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `eps_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `per_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `market_cap_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `mdd_source` text NOT NULL DEFAULT 'APP_CALCULATED';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `ma_source` text NOT NULL DEFAULT 'APP_CALCULATED';
--> statement-breakpoint
ALTER TABLE `stock_snapshots` ADD `price_stability_source` text NOT NULL DEFAULT 'APP_CALCULATED';
--> statement-breakpoint
UPDATE `daily_prices` SET `source` = 'TOSS' WHERE `source` = 'toss';
