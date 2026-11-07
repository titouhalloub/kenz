-- 036: catalog, geographic hierarchy, and audited price-source registry.
-- This migration only creates the data model. No external source is enabled by default.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_fr text not null,
  name_ar text not null,
  name_en text not null,
  category text not null,
  base_unit text not null check (base_unit in ('g','ml','unit')),
  typical_pack_sizes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(typical_pack_sizes) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_active_idx on public.products(category, slug) where is_active;

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias text not null,
  locale text not null default 'fr' check (locale in ('ar','fr','en')),
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (locale, normalized_alias)
);
create index product_aliases_product_idx on public.product_aliases(product_id);

create table public.communes (
  id uuid primary key default gen_random_uuid(),
  wilaya_code text not null check (wilaya_code ~ '^[0-9]{2,3}$'),
  official_code text,
  name_fr text not null,
  name_ar text not null,
  centroid_lat double precision check (centroid_lat between -90 and 90),
  centroid_lng double precision check (centroid_lng between -180 and 180),
  source_note text,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (wilaya_code, official_code)
);
create index communes_wilaya_idx on public.communes(wilaya_code, name_fr) where is_active;

create table public.price_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_type text not null check (source_type in ('official','scraped','merchant','crowd')),
  base_url text,
  license_note text,
  terms_reviewed_at timestamptz,
  robots_reviewed_at timestamptz,
  permission_reference text,
  trust_weight integer not null default 50 check (trust_weight between 0 and 100),
  reviewed boolean not null default false,
  enabled boolean not null default false,
  schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (reviewed and terms_reviewed_at is not null))
);
create index price_sources_enabled_idx on public.price_sources(source_type, slug) where enabled;

-- Initial source registry is intentionally disabled pending human review.
insert into public.price_sources (slug, name, source_type, license_note, trust_weight, reviewed, enabled)
values
  ('agriculture-official-baselines', 'Ministry of Agriculture published price references', 'official',
   'Manual/semi-automated entry only until an official structured feed and reuse terms are confirmed.', 90, false, false),
  ('regulated-price-notices', 'Official Journal and ministry regulated-price notices', 'official',
   'Curated manual entries with effective dates; verify each legal text before publishing.', 100, false, false),
  ('ons-price-index', 'ONS consumer price index', 'official',
   'Trend adjustment only; not a retail basket price feed.', 85, false, false),
  ('merchant-submissions', 'Verified Kenz merchant submissions', 'merchant',
   'Merchant-submitted shelf prices; requires merchant verification and review workflow.', 75, false, false),
  ('community-observations', 'Opt-in Kenz community observations', 'crowd',
   'Explicit opt-in; public contribution; neighborhood aggregates require at least three contributors.', 55, false, false)
on conflict (slug) do nothing;

alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.communes enable row level security;
alter table public.price_sources enable row level security;

revoke all on public.products, public.product_aliases, public.communes, public.price_sources from public, anon, authenticated;
grant select on public.products, public.communes, public.price_sources to anon, authenticated;

create policy "Active products are public" on public.products
for select to anon, authenticated using (is_active);
create policy "Active communes are public" on public.communes
for select to anon, authenticated using (is_active);
create policy "Only reviewed enabled sources are public" on public.price_sources
for select to anon, authenticated using (reviewed and enabled);

revoke truncate, references, trigger on public.products, public.product_aliases, public.communes, public.price_sources from anon, authenticated;
