-- 037: append-oriented price observations, area aggregates, and read-only fallback RPC.
-- Observation writes are reserved for trusted server/worker code. No client can write stats.

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  source_id uuid not null references public.price_sources(id),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  currency text not null default 'DZD' check (currency = 'DZD'),
  observed_at timestamptz not null,
  wilaya_code text check (wilaya_code is null or wilaya_code ~ '^[0-9]{2,3}$'),
  commune_id uuid references public.communes(id),
  geo_cell text,
  business_id uuid,
  contributor_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  quality_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (commune_id is null or wilaya_code is not null),
  check (geo_cell is null or commune_id is not null)
);
create index price_observations_product_area_time_idx
  on public.price_observations(product_id, wilaya_code, commune_id, observed_at desc);
create index price_observations_source_status_time_idx
  on public.price_observations(source_id, status, observed_at desc);

create table public.price_stats (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  area_level text not null check (area_level in ('neighborhood','commune','wilaya','national')),
  area_key text not null,
  window_days integer not null default 14 check (window_days between 1 and 90),
  median_unit_price_minor bigint not null check (median_unit_price_minor > 0),
  p25_unit_price_minor bigint not null check (p25_unit_price_minor > 0),
  p75_unit_price_minor bigint not null check (p75_unit_price_minor > 0),
  n_observations integer not null default 0 check (n_observations >= 0),
  n_contributors integer not null default 0 check (n_contributors >= 0),
  last_observed timestamptz not null,
  source_tiers text[] not null default '{}',
  calculated_at timestamptz not null default now(),
  unique (product_id, area_level, area_key, window_days),
  check (p25_unit_price_minor <= median_unit_price_minor),
  check (median_unit_price_minor <= p75_unit_price_minor),
  check (area_level <> 'neighborhood' or n_contributors >= 3)
);
create index price_stats_lookup_idx
  on public.price_stats(product_id, area_level, area_key, window_days, last_observed desc);

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.price_sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_fetched integer not null default 0 check (rows_fetched >= 0),
  rows_parsed integer not null default 0 check (rows_parsed >= 0),
  rows_accepted integer not null default 0 check (rows_accepted >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  status text not null default 'running' check (status in ('running','succeeded','partial','failed')),
  error_summary text
);
create index ingest_runs_source_started_idx on public.ingest_runs(source_id, started_at desc);

alter table public.price_observations enable row level security;
alter table public.price_stats enable row level security;
alter table public.ingest_runs enable row level security;

revoke all on public.price_observations, public.price_stats, public.ingest_runs from public, anon, authenticated;
grant select on public.price_stats to anon, authenticated;

create policy "Price aggregates are public" on public.price_stats
for select to anon, authenticated using (true);

revoke truncate, references, trigger on public.price_observations, public.price_stats, public.ingest_runs from anon, authenticated;

create or replace function public.get_area_prices(
  p_product_ids uuid[],
  p_wilaya_code text default null,
  p_commune_id uuid default null,
  p_geo_cell text default null,
  p_window_days integer default 14
)
returns table (
  product_id uuid,
  area_level text,
  area_key text,
  median_unit_price_minor bigint,
  p25_unit_price_minor bigint,
  p75_unit_price_minor bigint,
  n_observations integer,
  n_contributors integer,
  last_observed timestamptz,
  source_tiers text[],
  calculated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as (
    select
      ps.*,
      case ps.area_level
        when 'neighborhood' then 1
        when 'commune' then 2
        when 'wilaya' then 3
        when 'national' then 4
      end as fallback_rank
    from public.price_stats ps
    where ps.product_id = any(coalesce(p_product_ids, array[]::uuid[]))
      and ps.window_days = greatest(1, least(coalesce(p_window_days, 14), 90))
      and (
        (p_geo_cell is not null and ps.area_level = 'neighborhood' and ps.area_key = p_geo_cell)
        or (p_commune_id is not null and ps.area_level = 'commune' and ps.area_key = p_commune_id::text)
        or (p_wilaya_code is not null and ps.area_level = 'wilaya' and ps.area_key = p_wilaya_code)
        or (ps.area_level = 'national' and ps.area_key = 'DZ')
      )
  ),
  ranked as (
    select c.*, row_number() over (
      partition by c.product_id order by c.fallback_rank
    ) as rn
    from candidates c
  )
  select
    r.product_id, r.area_level, r.area_key, r.median_unit_price_minor,
    r.p25_unit_price_minor, r.p75_unit_price_minor, r.n_observations,
    r.n_contributors, r.last_observed, r.source_tiers, r.calculated_at
  from ranked r
  where r.rn = 1;
$$;

revoke all on function public.get_area_prices(uuid[], text, uuid, text, integer) from public;
grant execute on function public.get_area_prices(uuid[], text, uuid, text, integer) to anon, authenticated;
