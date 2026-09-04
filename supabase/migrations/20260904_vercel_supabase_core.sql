-- MyStockLog: Supabase becomes the durable application database.
-- Run in Supabase SQL Editor before switching the frontend to Vercel.
-- Secrets are never stored in this schema; server-only code uses SERVICE_ROLE.

create extension if not exists pgcrypto;

-- Cached dashboard payloads. `__DASHBOARD__` stores catalog, market overview,
-- and the last refresh report; each ticker stores its complete calculated view.
create table if not exists public.market_snapshots (
  symbol text primary key,
  payload jsonb not null,
  market_date date,
  updated_at timestamptz not null,
  refresh_cycle text not null
);

create index if not exists market_snapshots_market_date_idx
  on public.market_snapshots (market_date desc);

-- SEC data was already accumulated in D1. Keep the same primary key so it can
-- be moved without changing historical facts.
create table if not exists public.financial_quarters (
  ticker text not null,
  cik text not null,
  fiscal_year integer not null,
  fiscal_quarter text not null,
  period_end date not null,
  filed_at date not null,
  accession_number text not null,
  revenue numeric,
  operating_income numeric,
  net_income numeric,
  eps_basic numeric,
  eps_diluted numeric,
  operating_cash_flow numeric,
  capex numeric,
  free_cash_flow numeric,
  cash numeric,
  total_assets numeric,
  total_liabilities numeric,
  total_debt numeric,
  stockholders_equity numeric,
  source text not null default 'SEC',
  updated_at timestamptz not null,
  primary key (ticker, period_end)
);

create table if not exists public.sec_sync_state (
  ticker text primary key,
  cik text not null,
  last_accession text,
  last_filed_at date,
  checked_at timestamptz not null,
  status text not null,
  error text
);

create index if not exists financial_quarters_ticker_period_idx
  on public.financial_quarters (ticker, period_end desc);

-- Backtest reports are immutable records. Re-importing a run upserts its
-- metadata and replaces only the associated derived sections.
create table if not exists public.backtest_runs (
  id text primary key,
  run_date date not null,
  phase text not null,
  title text not null,
  algorithm_version text not null,
  period_start date,
  period_end date,
  universe text not null,
  config_json jsonb not null,
  summary_json jsonb not null,
  conclusion text not null,
  created_at timestamptz not null
);

create table if not exists public.backtest_sections (
  id text primary key,
  run_id text not null references public.backtest_runs(id) on delete cascade,
  parent_id text,
  section_type text not null,
  title text not null,
  summary text not null,
  report_data_json jsonb not null,
  sort_order integer not null
);

create index if not exists backtest_runs_date_idx
  on public.backtest_runs (run_date asc, created_at asc);
create index if not exists backtest_sections_run_sort_idx
  on public.backtest_sections (run_id, sort_order);

-- Each user owns their holdings and notes. Existing D1 records can be imported
-- under the selected Supabase Auth user by the migration script.
create table if not exists public.positions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  status text not null check (status in ('OPEN', 'CLOSED')),
  total_quantity numeric not null,
  avg_price numeric not null,
  realized_pnl numeric not null default 0,
  opened_at date not null,
  closed_at date,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.position_transactions (
  id text primary key,
  position_id text not null references public.positions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  transaction_type text not null check (transaction_type in ('BUY', 'ADD', 'PARTIAL_EXIT', 'EXIT')),
  trade_date date not null,
  quantity numeric not null,
  price numeric not null,
  opportunity_score numeric,
  price_stability text,
  buy_zone_low numeric,
  buy_zone_high numeric,
  buy_zone_mid numeric,
  profit_zone_low numeric,
  profit_zone_high numeric,
  fixed_profit_mid numeric,
  memo text,
  realized_pnl numeric,
  created_at timestamptz not null
);

create index if not exists positions_user_status_idx
  on public.positions (user_id, status, updated_at desc);
create index if not exists position_transactions_position_idx
  on public.position_transactions (position_id, trade_date desc, created_at desc);

-- These tables replace the D1 alert/notification state while keeping one
-- account's data isolated through Supabase Auth.
create table if not exists public.stock_alert_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  company text,
  active boolean not null default true,
  is_holding boolean not null default false,
  buy_enabled boolean not null default true,
  sell_enabled boolean not null default false,
  sell_manually_disabled boolean not null default false,
  approach_enabled boolean not null default false,
  approach_percent numeric not null default .03,
  buy_state text not null default 'unknown',
  sell_state text not null default 'unknown',
  previous_price numeric,
  previous_buy_low numeric,
  previous_buy_high numeric,
  previous_sell_low numeric,
  previous_sell_high numeric,
  last_market_date date,
  last_checked_at timestamptz,
  last_alert_at timestamptz,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create table if not exists public.push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, endpoint)
);

create table if not exists public.price_alert_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  alert_type text not null,
  event_reason text not null,
  market_date date not null,
  close_price numeric not null,
  zone_low numeric not null,
  zone_high numeric not null,
  opportunity_score numeric,
  trend text,
  volume_ratio numeric,
  title text not null,
  body text not null,
  read_at timestamptz,
  push_status text not null default 'pending',
  push_error text,
  created_at timestamptz not null,
  unique (user_id, ticker, alert_type, market_date, event_reason)
);

create table if not exists public.alert_evaluation_runs (
  market_date date primary key,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null,
  checked_count integer not null default 0,
  event_count integer not null default 0,
  error text
);

create index if not exists stock_alert_settings_user_idx on public.stock_alert_settings (user_id, active);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, active);
create index if not exists price_alert_events_user_idx on public.price_alert_events (user_id, created_at desc);

-- Market and research data is served by Vercel server functions only. User
-- tables are accessible directly only to their authenticated owner.
alter table public.market_snapshots enable row level security;
alter table public.financial_quarters enable row level security;
alter table public.sec_sync_state enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.backtest_sections enable row level security;
alter table public.positions enable row level security;
alter table public.position_transactions enable row level security;
alter table public.stock_alert_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.price_alert_events enable row level security;
alter table public.alert_evaluation_runs enable row level security;

drop policy if exists "positions_own" on public.positions;
create policy "positions_own" on public.positions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "position_transactions_own" on public.position_transactions;
create policy "position_transactions_own" on public.position_transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "stock_alert_settings_own" on public.stock_alert_settings;
create policy "stock_alert_settings_own" on public.stock_alert_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "price_alert_events_own" on public.price_alert_events;
create policy "price_alert_events_own" on public.price_alert_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The pre-existing price collector tables remain service-role write only.
alter table public.daily_prices enable row level security;
alter table public.stock_snapshots enable row level security;
alter table public.latest_prices enable row level security;
alter table public.collector_status enable row level security;
