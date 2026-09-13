-- Run once in the existing Deal Daily Supabase project's SQL editor.
-- Separate from puzzle scores; latest posted current net worth, one row per account.
begin;
create table if not exists public.clockout_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 24),
  net_worth numeric(24,2) not null check (net_worth >= 0 and net_worth <= 1000000000000000),
  generation integer not null check (generation between 1 and 1000000),
  updated_at timestamptz not null default now()
);
create index if not exists clockout_leaderboard_ranking
  on public.clockout_leaderboard (net_worth desc, updated_at asc, user_id asc);
alter table public.clockout_leaderboard enable row level security;
revoke all on public.clockout_leaderboard from anon, authenticated;
grant select on public.clockout_leaderboard to anon, authenticated;
grant insert (user_id, name, net_worth, generation), update (user_id, name, net_worth, generation)
  on public.clockout_leaderboard to authenticated;
drop policy if exists "Read net worth board" on public.clockout_leaderboard;
create policy "Read net worth board" on public.clockout_leaderboard
  for select to anon, authenticated using (true);
drop policy if exists "Post own net worth" on public.clockout_leaderboard;
create policy "Post own net worth" on public.clockout_leaderboard
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own net worth" on public.clockout_leaderboard;
create policy "Update own net worth" on public.clockout_leaderboard
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create or replace function public.clockout_stamp_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists clockout_stamp_submission on public.clockout_leaderboard;
create trigger clockout_stamp_submission before insert or update
  on public.clockout_leaderboard for each row execute function public.clockout_stamp_submission();
commit;
