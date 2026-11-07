-- 039: public-source provenance, idempotent ingestion, and moderation metadata.
-- Scrapers only stage pending observations. Nothing becomes public until reviewed.
alter table public.price_observations
  add column if not exists source_reference text,
  add column if not exists source_record_key text,
  add column if not exists ingest_run_id uuid references public.ingest_runs(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create unique index if not exists price_observations_source_record_key_uidx
  on public.price_observations(source_record_key);
create index if not exists price_observations_pending_review_idx
  on public.price_observations(created_at desc, source_id)
  where status = 'pending';
create index if not exists price_observations_ingest_run_idx
  on public.price_observations(ingest_run_id)
  where ingest_run_id is not null;

insert into public.price_sources
  (slug, name, source_type, base_url, license_note, trust_weight, reviewed, enabled, schedule,
   terms_reviewed_at, robots_reviewed_at, permission_reference)
values
  ('madrp-mercuriale', 'Ministry of Agriculture — daily agricultural price bulletin', 'official',
   'https://madr.gov.dz/mercuriale-des-prix/',
   'Public bulletin index and dated PDF documents. The collector checks robots.txt at runtime, downloads only same-host HTTPS PDFs, and stages all rows as pending for review.',
   90, true, true, 'daily', now(), now(), 'Owner-approved collection of openly accessible public bulletins; robots.txt is checked at runtime; all observations remain pending review'),
  ('dcw-tizi-ouzou-daily', 'Directorate of Commerce — Tizi Ouzou daily price statement', 'official',
   'https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article',
   'Public daily price statement page. The collector checks robots.txt at runtime, uses only the published retail-price table, and stages rows as pending for review.',
   85, true, true, 'daily', now(), now(), 'Owner-approved collection of openly accessible public pages; robots.txt is checked at runtime; all observations remain pending review'),
  ('dcw-jijel-daily', 'Directorate of Commerce — Jijel daily price statement', 'official',
   'https://www.dcwjijel.dz/index.php/moy-prix/prix-journ',
   'Public daily price statement page. The collector checks robots.txt at runtime, parses the published retail-price column, and excludes observations older than 14 days.',
   85, false, false, 'daily')
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  license_note = excluded.license_note,
  schedule = excluded.schedule,
  updated_at = now();

-- The project owner explicitly directed collection from openly accessible public pages.
-- Sources are enabled for collection, but robots.txt is checked at runtime and every
-- observation is staged as pending; no price reaches public aggregates until reviewed.
