CREATE TABLE IF NOT EXISTS financial_quarters (
  ticker TEXT NOT NULL,cik TEXT NOT NULL,fiscal_year INTEGER NOT NULL,fiscal_quarter TEXT NOT NULL,period_end TEXT NOT NULL,filed_at TEXT NOT NULL,accession_number TEXT NOT NULL,
  revenue REAL,operating_income REAL,net_income REAL,eps_basic REAL,eps_diluted REAL,operating_cash_flow REAL,capex REAL,free_cash_flow REAL,cash REAL,total_assets REAL,total_liabilities REAL,total_debt REAL,stockholders_equity REAL,
  source TEXT NOT NULL DEFAULT 'SEC',updated_at TEXT NOT NULL,PRIMARY KEY(ticker,period_end)
);
CREATE TABLE IF NOT EXISTS sec_sync_state (ticker TEXT PRIMARY KEY NOT NULL,cik TEXT NOT NULL,last_accession TEXT,last_filed_at TEXT,checked_at TEXT NOT NULL,status TEXT NOT NULL,error TEXT);
CREATE INDEX IF NOT EXISTS idx_financial_quarters_ticker_period ON financial_quarters(ticker,period_end DESC);
