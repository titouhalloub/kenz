-- 039: public-source provenance, idempotent ingestion, and moderation metadata.
-- Scrapers only stage pending observations. Nothing becomes public until reviewed.
alter table public.price_observations
  add column if not exists source_reference text,
  add column if not exists source_record_key text,
  add column if not exists ingest_run_id uuid references public.ingest_runs(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create unique index if not exists price_observations_source_record_key_uidx
  on public.price_observations(source_record_key)
  where source_record_key is not null;
create index if not exists price_observations_pending_review_idx
  on public.price_observations(created_at desc, source_id)
  where status = 'pending';
create index if not exists price_observations_ingest_run_idx
  on public.price_observations(ingest_run_id)
  where ingest_run_id is not null;

insert into public.price_sources
  (slug, name, source_type, base_url, license_note, trust_weight, reviewed, enabled, schedule)
values
  ('madrp-mercuriale', 'Ministry of Agriculture — daily agricultural price bulletin', 'official',
   'https://madr.gov.dz/mercuriale-des-prix/',
   'Public bulletin index and dated PDF documents. The collector checks robots.txt at runtime, downloads only same-host HTTPS PDFs, and stages all rows as pending for review.',
   90, false, false, 'daily'),
  ('dcw-tizi-ouzou-daily', 'Directorate of Commerce — Tizi Ouzou daily price statement', 'official',
   'https://www.dcwtiziouzou.dz/fr/index.php?Itemid=77&id=76&option=com_content&view=article',
   'Public daily price statement page. The collector checks robots.txt at runtime, uses only the published retail-price table, and stages rows as pending for review.',
   85, false, false, 'daily')
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  license_note = excluded.license_note,
  schedule = excluded.schedule,
  updated_at = now();

-- No source is enabled by migration. An operator must explicitly confirm source review.
