export const marketSnapshotsSchema = `CREATE TABLE IF NOT EXISTS market_snapshots (
  symbol TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  market_date TEXT,
  updated_at TEXT NOT NULL,
  refresh_cycle TEXT NOT NULL
)`

export const marketDataSchemas = [
  `CREATE TABLE IF NOT EXISTS daily_prices (ticker TEXT NOT NULL, market_date TEXT NOT NULL, open REAL, high REAL, low REAL, close REAL NOT NULL, volume REAL, source TEXT NOT NULL, PRIMARY KEY (ticker, market_date))`,
  `CREATE TABLE IF NOT EXISTS stock_snapshots (ticker TEXT NOT NULL, snapshot_date TEXT NOT NULL, price REAL, eps REAL, per REAL, market_cap REAL, drawdown_52w REAL, mdd_reference REAL, mdd_proximity REAL, ma20 REAL, ma60 REAL, ma120 REAL, ma200 REAL, price_stability TEXT, price_source TEXT NOT NULL DEFAULT 'TOSS', eps_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE', per_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE', market_cap_source TEXT NOT NULL DEFAULT 'GOOGLE_FINANCE', mdd_source TEXT NOT NULL DEFAULT 'APP_CALCULATED', ma_source TEXT NOT NULL DEFAULT 'APP_CALCULATED', price_stability_source TEXT NOT NULL DEFAULT 'APP_CALCULATED', PRIMARY KEY (ticker, snapshot_date))`,
] as const

export const priceAlertSchemas = [
  `CREATE TABLE IF NOT EXISTS strategy_notes_d1 (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, ticker TEXT NOT NULL, content TEXT NOT NULL, tag TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stock_alert_settings (owner_id TEXT NOT NULL, ticker TEXT NOT NULL, company TEXT, active INTEGER NOT NULL DEFAULT 1, is_holding INTEGER NOT NULL DEFAULT 0, buy_enabled INTEGER NOT NULL DEFAULT 1, sell_enabled INTEGER NOT NULL DEFAULT 0, sell_manually_disabled INTEGER NOT NULL DEFAULT 0, approach_enabled INTEGER NOT NULL DEFAULT 0, approach_percent REAL NOT NULL DEFAULT 0.03, buy_state TEXT NOT NULL DEFAULT 'unknown', sell_state TEXT NOT NULL DEFAULT 'unknown', previous_price REAL, previous_buy_low REAL, previous_buy_high REAL, previous_sell_low REAL, previous_sell_high REAL, last_market_date TEXT, last_checked_at TEXT, last_alert_at TEXT, paused INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (owner_id,ticker))`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id,endpoint))`,
  `CREATE TABLE IF NOT EXISTS price_alert_events (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, ticker TEXT NOT NULL, alert_type TEXT NOT NULL, event_reason TEXT NOT NULL, market_date TEXT NOT NULL, close_price REAL NOT NULL, zone_low REAL NOT NULL, zone_high REAL NOT NULL, opportunity_score REAL, trend TEXT, volume_ratio REAL, title TEXT NOT NULL, body TEXT NOT NULL, read_at TEXT, push_status TEXT NOT NULL DEFAULT 'pending', push_error TEXT, created_at TEXT NOT NULL, UNIQUE(owner_id,ticker,alert_type,market_date,event_reason))`,
  `CREATE TABLE IF NOT EXISTS alert_evaluation_runs (market_date TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL, checked_count INTEGER NOT NULL DEFAULT 0, event_count INTEGER NOT NULL DEFAULT 0, error TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_alert_settings_owner ON stock_alert_settings(owner_id,active)`,
  `CREATE INDEX IF NOT EXISTS idx_push_owner ON push_subscriptions(owner_id,active)`,
  `CREATE INDEX IF NOT EXISTS idx_alert_events_owner ON price_alert_events(owner_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_strategy_notes_owner ON strategy_notes_d1(owner_id,updated_at DESC)`,
] as const
