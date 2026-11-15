-- 057_price_stats_windows.sql  (file name kept from the first draft; content = price engine unification)
-- DRAFT FOR OPERATOR APPROVAL. NOT APPLIED. Review before running.
--
-- Builds on 036/037/039/043. No new price tables: it extends price_observations / price_sources /
-- price_stats and the existing RPCs. It does NOT insert, accept, edit or delete any observation,
-- price or moderator row.
--
--  1. price_engine_settings + get_price_windows(): configurable fresh (14) / extended (30) windows.
--  2. refresh_price_stats_all(): rebuilds every configured window (called after ingestion, import, review).
--  3. 'admin_import' source type + disabled 'admin-manual-import' source (operator enables it after review).
--  4. Optional evidence on observations (https link + short note).
--  5. submit_price_observation(): same rules as 043 + optional evidence + configurable window.
--  6. admin_stage_price_observation(): moderator-only single manual entry -> PENDING.
--  7. list_price_observations(): moderator history by status (pending / accepted / rejected).
--  8. review_price_observation(): refreshes all windows; refuses observations older than the extended window.

-- 1. Settings ------------------------------------------------------------------------------
create table if not exists public.price_engine_settings (
  id boolean primary key default true check (id),
  fresh_window_days integer not null default 14,
  extended_window_days integer not null default 30,
  updated_at timestamptz not null default now(),
  check (fresh_window_days >= 1 and fresh_window_days < extended_window_days and extended_window_days <= 90)
);
insert into public.price_engine_settings (id) values (true) on conflict (id) do nothing;
alter table public.price_engine_settings enable row level security;
revoke all on public.price_engine_settings from public, anon, authenticated;
grant select on public.price_engine_settings to anon, authenticated;
create policy "Price windows are public" on public.price_engine_settings
  for select to anon, authenticated using (true);
revoke truncate, references, trigger on public.price_engine_settings from anon, authenticated;

create or replace function public.get_price_windows()
returns table (fresh_days integer, extended_days integer)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(s.fresh_window_days, 14), coalesce(s.extended_window_days, 30)
  from (select 1) d left join public.price_engine_settings s on s.id;
$$;
revoke all on function public.get_price_windows() from public;
grant execute on function public.get_price_windows() to anon, authenticated, service_role;

-- 2. Refresh every configured window ---------------------------------------------------------
create or replace function public.refresh_price_stats_all()
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_fresh integer;
  v_extended integer;
  v_extended integer;
begin
  select fresh_days, extended_days into v_fresh, v_extended from public.get_price_windows();
  perform public.refresh_price_stats(v_fresh);
  perform public.refresh_price_stats(v_extended);
end;
$$;
revoke all on function public.refresh_price_stats_all() from public, anon, authenticated;
grant execute on function public.refresh_price_stats_all() to service_role;

-- 3. Admin import source ------------------------------------------------------------------------
alter table public.price_sources drop constraint if exists price_sources_source_type_check;
alter table public.price_sources add constraint price_sources_source_type_check
  check (source_type in ('official','scraped','merchant','crowd','admin_import'));
-- Disabled and unreviewed on purpose: an operator enables it (workers/price-ingest/review.ts) after review.
insert into public.price_sources (slug, name, source_type, license_note, trust_weight, reviewed, enabled)
values ('admin-manual-import', 'Operator-entered or CSV-imported prices (source reference required)', 'admin_import',
        'Entered by a Kenz operator from a cited source; always staged as pending.', 70, false, false)
on conflict (slug) do nothing;

-- 4. Optional evidence ------------------------------------------------------------------------------
alter table public.price_observations
  add column if not exists evidence_url text
    check (evidence_url is null or (evidence_url ~ '^https://' and char_length(evidence_url) <= 500)),
  add column if not exists note text
    check (note is null or char_length(note) <= 300);

-- 5. Community submission (same rules as 043 + evidence + configurable window) -------------------------
drop function if exists public.submit_price_observation(text,bigint,timestamptz,text,uuid,boolean);
create or replace function public.submit_price_observation(
  p_product_slug text,
  p_unit_price_minor bigint,
  p_observed_at timestamptz,
  p_wilaya_code text,
  p_commune_id uuid default null,
  p_consent boolean default false,
  p_evidence_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_product_id uuid;
  v_source_id uuid;
  v_id uuid;
  v_median bigint;
  v_fresh integer;
  v_flags text[] := array['crowd_contribution','awaiting_operator_review'];
  v_record_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_consent is distinct from true then raise exception 'Explicit public contribution consent is required'; end if;
  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 500000000 then
    raise exception 'Price must be a positive DZD amount within the supported range';
  end if;
  select fresh_days, extended_days into v_fresh, v_extended from public.get_price_windows();
  if p_observed_at is null or p_observed_at < now() - make_interval(days => v_extended) or p_observed_at > now() + interval '1 day' then
    raise exception 'Observation date must be within the last % days', v_extended;
  end if;
  if p_wilaya_code is null or p_wilaya_code !~ '^(0[1-9]|[1-5][0-9]|6[0-9])$' then
    raise exception 'Valid wilaya code is required';
  end if;
  if p_unit_price_minor < 100 then v_flags := array_append(v_flags, 'implausibly_low_price'); end if;
  end if;
  if p_evidence_url is not null and (p_evidence_url !~ '^https://' or char_length(p_evidence_url) > 500) then
    raise exception 'Evidence must be an https link of at most 500 characters';
  end if;

  select id into v_product_id from public.products where slug = p_product_slug and is_active = true;
  if v_product_id is null then raise exception 'Unknown or inactive product'; end if;

  if p_commune_id is not null and not exists (
    select 1 from public.communes c
    where c.id = p_commune_id and c.wilaya_code = p_wilaya_code and c.is_active = true
  ) then raise exception 'Commune does not belong to the selected wilaya'; end if;

  select id into v_source_id from public.price_sources
  where slug = 'community-observations' and enabled = true and reviewed = true;
  if v_source_id is null then raise exception 'Community price contributions are not enabled yet'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if (select count(*) from public.price_observations
      where contributor_id = v_user and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Daily contribution limit reached';
  end if;
  if exists (
    select 1 from public.price_observations
    where contributor_id = v_user and product_id = v_product_id
      and observed_at::date = p_observed_at::date and status <> 'rejected'
  ) then raise exception 'You have already submitted this product for that date'; end if;

  select median_unit_price_minor into v_median from public.price_stats
  where product_id = v_product_id and area_level = 'wilaya' and area_key = p_wilaya_code and window_days = v_fresh limit 1;
  if v_median is null then
    select median_unit_price_minor into v_median from public.price_stats
    where product_id = v_product_id and area_level = 'national' and area_key = 'DZ' and window_days = v_fresh limit 1;
  end if;
  if v_median is not null and (
    p_unit_price_minor::numeric < greatest(1, v_median / 4)::numeric
    or p_unit_price_minor::numeric > v_median::numeric * 4
  ) then v_flags := array_append(v_flags, 'outside_reference_range'); end if;
  if p_evidence_url is not null then v_flags := array_append(v_flags, 'has_evidence'); end if;

  insert into public.price_contributor_preferences(user_id,opt_in,consented_at,updated_at)
  values (v_user,true,now(),now())
  on conflict (user_id) do update set opt_in=true,consented_at=now(),updated_at=now();

  v_record_key := 'crowd:' || md5(v_user::text || '|' || v_product_id::text || '|' ||
    p_observed_at::text || '|' || p_unit_price_minor::text || '|' || p_wilaya_code);
  insert into public.price_observations(
    product_id,source_id,unit_price_minor,currency,observed_at,wilaya_code,commune_id,
    contributor_id,status,quality_flags,source_reference,source_record_key,evidence_url
  ) values (
    v_product_id,v_source_id,p_unit_price_minor,'DZD',p_observed_at,p_wilaya_code,p_commune_id,
    v_user,'pending',v_flags,'user-confirmed public contribution',v_record_key,p_evidence_url
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_price_observation(text,bigint,timestamptz,text,uuid,boolean,text) from public, anon;
grant execute on function public.submit_price_observation(text,bigint,timestamptz,text,uuid,boolean,text) to authenticated;

-- 6. Moderator single manual entry -> PENDING ---------------------------------------------------------
create or replace function public.admin_stage_price_observation(
  p_product_slug text,
  p_unit_price_minor bigint,
  p_observed_at timestamptz,
  p_wilaya_code text,
  p_source_reference text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_product_id uuid;
  v_source_id uuid;
  v_id uuid;
  v_median bigint;
  v_fresh integer;
  v_extended integer;
  v_flags text[] := array['admin_import','awaiting_review'];
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 500000000 then
    raise exception 'Price must be a positive DZD amount within the supported range';
  end if;
  select fresh_days, extended_days into v_fresh, v_extended from public.get_price_windows();
  if p_observed_at is null or p_observed_at > now() + interval '1 day' then raise exception 'Invalid observation date'; end if;
  if p_observed_at < now() - make_interval(days => v_fresh) then v_flags := array_append(v_flags,'older_than_fresh_window'); end if;
  if p_observed_at < now() - make_interval(days => v_extended) then v_flags := array_append(v_flags,'older_than_extended_window'); end if;
  if p_wilaya_code is not null and p_wilaya_code !~ '^(0[1-9]|[1-5][0-9]|6[0-9])$' then
    raise exception 'Invalid wilaya code';
  end if;
  if p_unit_price_minor < 100 then v_flags := array_append(v_flags, 'implausibly_low_price'); end if;
  if char_length(trim(coalesce(p_source_reference,''))) not between 3 and 500 then
    raise exception 'A source reference (bulletin, URL or document) is required';
  end if;
  select id into v_product_id from public.products where slug = p_product_slug and is_active = true;
  if v_product_id is null then raise exception 'Unknown or inactive product'; end if;
  select id into v_source_id from public.price_sources
  where slug = 'admin-manual-import' and enabled = true and reviewed = true;
  if v_source_id is null then raise exception 'Manual imports are not enabled yet (operator must review the source)'; end if;

  select median_unit_price_minor into v_median from public.price_stats
  where product_id = v_product_id and area_level = 'national' and area_key = 'DZ' and window_days = v_fresh limit 1;
  if v_median is not null and (
    p_unit_price_minor::numeric < greatest(1, v_median / 4)::numeric or p_unit_price_minor::numeric > v_median::numeric * 4
  ) then v_flags := array_append(v_flags,'outside_reference_range'); end if;

  insert into public.price_observations(
    product_id,source_id,unit_price_minor,currency,observed_at,wilaya_code,contributor_id,status,
    quality_flags,source_reference,source_record_key,note
  ) values (
    v_product_id,v_source_id,p_unit_price_minor,'DZD',p_observed_at,p_wilaya_code,v_user,'pending',
    v_flags,trim(p_source_reference),
    'admin:' || md5(v_product_id::text || '|' || p_observed_at::text || '|' || coalesce(p_wilaya_code,'DZ') || '|' ||
                    p_unit_price_minor::text || '|' || trim(p_source_reference)),
    nullif(left(trim(coalesce(p_note,'')),300),'')
  )
  on conflict (source_record_key) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'This exact price is already staged'; end if;
  return v_id;
end;
$$;
revoke all on function public.admin_stage_price_observation(text,bigint,timestamptz,text,text,text) from public, anon;
grant execute on function public.admin_stage_price_observation(text,bigint,timestamptz,text,text,text) to authenticated;

-- 7. Moderator history by status ----------------------------------------------------------------------------
create or replace function public.list_price_observations(p_status text default 'pending', p_limit integer default 100)
returns table (
  observation_id uuid, product_slug text, product_name text, base_unit text,
  source_slug text, source_name text, source_type text,
  unit_price_minor bigint, observed_at timestamptz, wilaya_code text, status text,
  quality_flags text[], source_reference text, evidence_url text, note text,
  reviewed_at timestamptz, review_reason text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_status not in ('pending','accepted','rejected') then raise exception 'Invalid status'; end if;
  return query
  select o.id,p.slug,p.name_fr,p.base_unit::text,s.slug,s.name,s.source_type,
         o.unit_price_minor,o.observed_at,o.wilaya_code,o.status,o.quality_flags,o.source_reference,
         o.evidence_url,o.note,o.reviewed_at,
         (select r.reason from public.price_observation_reviews r where r.observation_id=o.id order by r.reviewed_at desc limit 1)
  from public.price_observations o
  join public.products p on p.id=o.product_id
  join public.price_sources s on s.id=o.source_id
  where o.status=p_status
  order by o.observed_at desc,o.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;
revoke all on function public.list_price_observations(text,integer) from public, anon;
grant execute on function public.list_price_observations(text,integer) to authenticated;

-- 8. Review: refresh every window, refuse expired observations --------------------------------------------
create or replace function public.review_price_observation(
  p_observation_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_source_id uuid;
  v_observed timestamptz;
  v_extended integer;
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid review decision'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A review reason is required'; end if;
  select source_id, observed_at into v_source_id, v_observed
  from public.price_observations where id=p_observation_id and status='pending';
  if v_source_id is null then raise exception 'Pending observation not found'; end if;
  select extended_days into v_extended from public.get_price_windows();
  if p_decision='accepted' and v_observed < now() - make_interval(days => v_extended) then
    raise exception 'Observation is older than % days and cannot be published; reject it or import a recent one', v_extended;
  end if;
  if p_decision='accepted' and not exists (
    select 1 from public.price_sources where id=v_source_id and enabled=true and reviewed=true
  ) then raise exception 'The source is disabled or not reviewed'; end if;
  update public.price_observations
  set status=p_decision,reviewed_at=now(),reviewed_by=v_user,
      quality_flags=case when p_decision='rejected'
        then array_append(quality_flags,'moderator_rejected') else quality_flags end
  where id=p_observation_id and status='pending';
  if not found then raise exception 'Observation was already reviewed'; end if;
  insert into public.price_observation_reviews(observation_id,reviewer_id,decision,reason)
  values (p_observation_id,v_user,p_decision,trim(p_reason));
  perform public.refresh_price_stats_all();
end;
$$;
revoke all on function public.review_price_observation(uuid,text,text) from public, anon;
grant execute on function public.review_price_observation(uuid,text,text) to authenticated;
