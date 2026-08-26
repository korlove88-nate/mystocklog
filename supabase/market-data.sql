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
  price_source text not null default 'TOSS',
  eps_source text not null default 'GOOGLE_FINANCE',
  per_source text not null default 'GOOGLE_FINANCE',
  market_cap_source text not null default 'GOOGLE_FINANCE',
  mdd_source text not null default 'APP_CALCULATED',
  ma_source text not null default 'APP_CALCULATED',
  price_stability_source text not null default 'APP_CALCULATED',
  primary key (ticker, snapshot_date)
);

-- 장중 현재가는 이력으로 누적하지 않고 종목별 최신 행만 유지한다.
create table if not exists public.latest_prices (
  ticker text primary key,
  price numeric not null,
  change numeric,
  change_percent numeric,
  updated_at timestamptz not null default now()
);

-- Mac mini 수집기의 연결/IP 상태. 인증정보는 저장하지 않는다.
create table if not exists public.collector_status (
  collector_id text primary key,
  status text not null check (status in ('NORMAL','IP_CHANGED','API_ERROR')),
  previous_ip text,
  current_ip text,
  detected_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz not null default now()
);

alter table public.daily_prices enable row level security;
alter table public.stock_snapshots enable row level security;
alter table public.latest_prices enable row level security;
alter table public.collector_status enable row level security;

-- 적축은 서버의 service-role key로만 수행하므로 public insert policy를 추가하지 않는다.
