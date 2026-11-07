-- 038: user-owned simulator scenarios.
-- Store only scenario settings and basket overrides, never income, account balances,
-- safe-to-spend values, or computed budget results.

create table public.simulator_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My scenario' check (char_length(title) between 1 and 80),
  month date not null check (extract(day from month) = 1),
  adults smallint not null default 1 check (adults between 1 and 30),
  children smallint not null default 0 check (children between 0 and 30),
  child_consumption_permille smallint not null default 500
    check (child_consumption_permille between 0 and 1000),
  basket_overrides jsonb not null default '[]'::jsonb
    check (jsonb_typeof(basket_overrides) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index simulator_scenarios_owner_month_idx
  on public.simulator_scenarios(user_id, month desc, updated_at desc);

alter table public.simulator_scenarios enable row level security;
revoke all on public.simulator_scenarios from public, anon, authenticated;
grant select, insert, update, delete on public.simulator_scenarios to authenticated;

create policy "Users read their own simulator scenarios" on public.simulator_scenarios
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own simulator scenarios" on public.simulator_scenarios
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own simulator scenarios" on public.simulator_scenarios
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users delete their own simulator scenarios" on public.simulator_scenarios
for delete to authenticated using ((select auth.uid()) = user_id);

revoke truncate, references, trigger on public.simulator_scenarios from anon, authenticated;
