-- Dashboard requests are queued in Supabase; the Mac mini is the only
-- process that consumes them and calls Toss. Nothing on Vercel calls Toss.
create table if not exists public.refresh_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('CURRENT_PRICE')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  message text,
  error_code text
);

create index if not exists refresh_requests_status_requested_idx
  on public.refresh_requests (status, requested_at);

alter table public.refresh_requests enable row level security;
-- No browser policy: Vercel and the Mac mini use the service-role key only.
