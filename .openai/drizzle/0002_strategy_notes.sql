CREATE TABLE IF NOT EXISTS strategy_notes_d1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  content TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strategy_notes_owner
  ON strategy_notes_d1(owner_id, updated_at DESC);
