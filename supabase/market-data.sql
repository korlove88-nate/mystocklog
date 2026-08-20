create table if not exists public.daily_prices (
  ticker text not null,
  market_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  volume numeric,
  source text not null,
  primary key (ticker, market_date)
);

create table if not exists public.stock_snapshots (
  ticker text not null,
  snapshot_date date not null,
  price numeric,
  eps numeric,
  per numeric,
  market_cap numeric,
  drawdown_52w numeric,
  mdd_reference numeric,
  mdd_proximity numeric,
  ma20 numeric,
  ma60 numeric,
  ma120 numeric,
  ma200 numeric,
  price_stability text check (price_stability in ('하락 지속','관찰','안정 시도','안정')),
  primary key (ticker, snapshot_date)
);

alter table public.daily_prices enable row level security;
alter table public.stock_snapshots enable row level security;

-- 적축은 서버의 service-role key로만 수행하므로 public insert policy를 추가하지 않는다.
