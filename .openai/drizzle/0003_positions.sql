CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY NOT NULL,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL,
  total_quantity REAL NOT NULL,
  avg_price REAL NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS position_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  position_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  opportunity_score REAL,
  price_stability TEXT,
  buy_zone_low REAL,
  buy_zone_high REAL,
  buy_zone_mid REAL,
  profit_zone_low REAL,
  profit_zone_high REAL,
  fixed_profit_mid REAL,
  memo TEXT,
  realized_pnl REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(position_id) REFERENCES positions(id)
);

CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_transactions_position ON position_transactions(position_id, trade_date DESC, created_at DESC);
