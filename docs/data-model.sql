create table stocks (
  id uuid primary key default gen_random_uuid(), ticker text not null unique, company text not null,
  sector text, active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table stock_prices (
  id bigint generated always as identity primary key, ticker text not null references stocks(ticker), trade_date date not null,
  open numeric, high numeric, low numeric, close numeric, adjusted_close numeric, volume bigint,
  unique(ticker, trade_date)
);
create table stock_metric_snapshots (
  ticker text not null references stocks(ticker), metric_date date not null, market_cap numeric, pe numeric, eps numeric,
  ath numeric, atl numeric, high_52w numeric, low_52w numeric, drawdown_52w numeric, year_open numeric, ytd_return numeric,
  return_1m numeric, return_3m numeric, return_6m numeric, return_1y numeric, return_3y numeric, return_5y numeric,
  ma20 numeric, ma60 numeric, ma120 numeric, ma200 numeric, primary key(ticker, metric_date)
);
create table stock_annual_drawdowns (
  ticker text not null references stocks(ticker), year smallint not null, mdd numeric not null,
  peak_date date, trough_date date, calculated_at timestamptz not null default now(), primary key(ticker, year)
);
create table strategy_notes (
  id uuid primary key default gen_random_uuid(), ticker text not null references stocks(ticker), content text not null,
  tag text not null check (tag in ('가격','실적','이슈','리스크','전략')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table stock_issues (
  id uuid primary key default gen_random_uuid(), ticker text not null references stocks(ticker), issue_date date not null,
  title text not null, summary text, tag text, source text, created_at timestamptz not null default now()
);

-- 가격 기반 지표는 adjusted_close 기준을 기본으로 계산한다. 원시 OHLC는 원본 종가를 보존한다.
-- 연도별 MDD를 별도 테이블로 두어 연도 변경 시 스키마 변경을 피한다.
