export const marketSnapshotsSchema = `CREATE TABLE IF NOT EXISTS market_snapshots (
  symbol TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  market_date TEXT,
  updated_at TEXT NOT NULL,
  refresh_cycle TEXT NOT NULL
)`
