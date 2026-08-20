CREATE TABLE IF NOT EXISTS `daily_prices` (
  `ticker` text NOT NULL,
  `market_date` text NOT NULL,
  `open` real,
  `high` real,
  `low` real,
  `close` real NOT NULL,
  `volume` real,
  `source` text NOT NULL,
  PRIMARY KEY (`ticker`, `market_date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_snapshots` (
  `ticker` text NOT NULL,
  `snapshot_date` text NOT NULL,
  `price` real,
  `eps` real,
  `per` real,
  `market_cap` real,
  `drawdown_52w` real,
  `mdd_reference` real,
  `mdd_proximity` real,
  `ma20` real,
  `ma60` real,
  `ma120` real,
  `ma200` real,
  `price_stability` text,
  `price_source` text NOT NULL DEFAULT 'TOSS',
  `eps_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE',
  `per_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE',
  `market_cap_source` text NOT NULL DEFAULT 'GOOGLE_FINANCE',
  `mdd_source` text NOT NULL DEFAULT 'APP_CALCULATED',
  `ma_source` text NOT NULL DEFAULT 'APP_CALCULATED',
  `price_stability_source` text NOT NULL DEFAULT 'APP_CALCULATED',
  PRIMARY KEY (`ticker`, `snapshot_date`)
);
