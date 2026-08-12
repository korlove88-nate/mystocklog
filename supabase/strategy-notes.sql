-- Run once in Supabase SQL Editor. This schema requires Supabase Auth.
create extension if not exists pgcrypto;

create table if not exists public.strategy_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  content text not null check (char_length(content) between 1 and 2000),
  tag text not null check (tag in ('가격','실적','이슈','리스크','전략')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists strategy_notes_user_updated_idx
  on public.strategy_notes (user_id, updated_at desc);

alter table public.strategy_notes enable row level security;

drop policy if exists "strategy_notes_select_own" on public.strategy_notes;
create policy "strategy_notes_select_own" on public.strategy_notes
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "strategy_notes_insert_own" on public.strategy_notes;
create policy "strategy_notes_insert_own" on public.strategy_notes
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "strategy_notes_update_own" on public.strategy_notes;
create policy "strategy_notes_update_own" on public.strategy_notes
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "strategy_notes_delete_own" on public.strategy_notes;
create policy "strategy_notes_delete_own" on public.strategy_notes
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.strategy_notes from anon;
grant select, insert, update, delete on public.strategy_notes to authenticated;
