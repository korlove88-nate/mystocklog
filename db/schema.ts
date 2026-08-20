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
