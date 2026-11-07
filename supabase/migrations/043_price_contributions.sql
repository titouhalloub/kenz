-- 043: explicit-consent crowd and verified-merchant price submissions.
create table public.price_contributor_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opt_in boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not opt_in or consented_at is not null)
);

alter table public.price_contributor_preferences enable row level security;
revoke all on public.price_contributor_preferences from public, anon, authenticated;
grant select, insert, update on public.price_contributor_preferences to authenticated;
create policy "Contributors manage their own preference"
  on public.price_contributor_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke truncate, references, trigger on public.price_contributor_preferences from anon, authenticated;

-- Explicit owner instruction authorizes opt-in submissions. All observations remain pending.
update public.price_sources
set reviewed = true,
    enabled = true,
    terms_reviewed_at = coalesce(terms_reviewed_at, now()),
    permission_reference = 'Owner-approved Kenz opt-in contributions; explicit consent required; pending review before publication',
    updated_at = now()
where slug in ('community-observations', 'merchant-submissions');

create or replace function public.submit_price_observation(
  p_product_slug text,
  p_unit_price_minor bigint,
  p_observed_at timestamptz,
  p_wilaya_code text,
  p_commune_id uuid default null,
  p_consent boolean default false
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
  v_flags text[] := array['crowd_contribution','awaiting_operator_review'];
  v_record_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_consent is distinct from true then raise exception 'Explicit public contribution consent is required'; end if;
  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 500000000 then
    raise exception 'Price must be a positive DZD amount within the supported range';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '14 days' or p_observed_at > now() + interval '1 day' then
    raise exception 'Observation date must be within the last 14 days';
  end if;
  if p_wilaya_code is null or p_wilaya_code !~ '^[0-9]{2,3}$' then
    raise exception 'Valid wilaya code is required';
  end if;

  select id into v_product_id
  from public.products
  where slug = p_product_slug and is_active = true;
  if v_product_id is null then raise exception 'Unknown or inactive product'; end if;

  if p_commune_id is not null and not exists (
    select 1 from public.communes c
    where c.id = p_commune_id and c.wilaya_code = p_wilaya_code and c.is_active = true
  ) then raise exception 'Commune does not belong to the selected wilaya'; end if;

  select id into v_source_id
  from public.price_sources
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

  select median_unit_price_minor into v_median
  from public.price_stats
  where product_id = v_product_id and area_level = 'wilaya'
    and area_key = p_wilaya_code and window_days = 14
  limit 1;
  if v_median is null then
    select median_unit_price_minor into v_median
    from public.price_stats
    where product_id = v_product_id and area_level = 'national'
      and area_key = 'DZ' and window_days = 14
    limit 1;
  end if;
  if v_median is not null and (
    p_unit_price_minor::numeric < greatest(1, v_median / 4)::numeric
    or p_unit_price_minor::numeric > v_median::numeric * 4
  ) then
    v_flags := array_append(v_flags, 'outside_reference_range');
  end if;

  insert into public.price_contributor_preferences(user_id,opt_in,consented_at,updated_at)
  values (v_user,true,now(),now())
  on conflict (user_id) do update
    set opt_in=true,consented_at=now(),updated_at=now();

  v_record_key := 'crowd:' || md5(v_user::text || '|' || v_product_id::text || '|' ||
    p_observed_at::text || '|' || p_unit_price_minor::text || '|' || p_wilaya_code);
  insert into public.price_observations(
    product_id,source_id,unit_price_minor,currency,observed_at,wilaya_code,commune_id,
    contributor_id,status,quality_flags,source_reference,source_record_key
  ) values (
    v_product_id,v_source_id,p_unit_price_minor,'DZD',p_observed_at,p_wilaya_code,p_commune_id,
    v_user,'pending',v_flags,'user-confirmed public contribution',v_record_key
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_price_observation(text,bigint,timestamptz,text,uuid,boolean) from public, anon;
grant execute on function public.submit_price_observation(text,bigint,timestamptz,text,uuid,boolean) to authenticated;

create or replace function public.submit_merchant_price_observation(
  p_business_id uuid,
  p_product_slug text,
  p_unit_price_minor bigint,
  p_observed_at timestamptz,
  p_wilaya_code text,
  p_commune_id uuid default null,
  p_consent boolean default false
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
  v_flags text[] := array['merchant_submission','awaiting_operator_review'];
  v_record_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_consent is distinct from true then raise exception 'Explicit public price-sharing consent is required'; end if;
  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 500000000 then
    raise exception 'Price must be a positive DZD amount within the supported range';
  end if;
  if p_observed_at is null or p_observed_at < now() - interval '14 days' or p_observed_at > now() + interval '1 day' then
    raise exception 'Observation date must be within the last 14 days';
  end if;
  if p_wilaya_code is null or p_wilaya_code !~ '^[0-9]{2,3}$' then
    raise exception 'Valid wilaya code is required';
  end if;
  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = v_user
      and b.verification_status = 'documents_verified' and b.is_published = true
  ) then
    raise exception 'Only owners of published, document-verified businesses may submit merchant prices';
  end if;

  select id into v_product_id
  from public.products where slug = p_product_slug and is_active = true;
  if v_product_id is null then raise exception 'Unknown or inactive product'; end if;

  if p_commune_id is not null and not exists (
    select 1 from public.communes c
    where c.id = p_commune_id and c.wilaya_code = p_wilaya_code and c.is_active = true
  ) then raise exception 'Commune does not belong to the selected wilaya'; end if;

  select id into v_source_id
  from public.price_sources
  where slug = 'merchant-submissions' and enabled = true and reviewed = true;
  if v_source_id is null then raise exception 'Merchant price submissions are not enabled yet'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
  if (select count(*) from public.price_observations
      where business_id = p_business_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Daily merchant price submission limit reached';
  end if;
  if exists (
    select 1 from public.price_observations
    where business_id = p_business_id and product_id = v_product_id
      and observed_at::date = p_observed_at::date and status <> 'rejected'
  ) then raise exception 'This business already submitted the product for that date'; end if;

  select median_unit_price_minor into v_median
  from public.price_stats
  where product_id = v_product_id and area_level = 'wilaya'
    and area_key = p_wilaya_code and window_days = 14
  limit 1;
  if v_median is null then
    select median_unit_price_minor into v_median
    from public.price_stats
    where product_id = v_product_id and area_level = 'national'
      and area_key = 'DZ' and window_days = 14
    limit 1;
  end if;
  if v_median is not null and (
    p_unit_price_minor::numeric < greatest(1, v_median / 4)::numeric
    or p_unit_price_minor::numeric > v_median::numeric * 4
  ) then
    v_flags := array_append(v_flags, 'outside_reference_range');
  end if;

  v_record_key := 'merchant:' || md5(p_business_id::text || '|' || v_product_id::text || '|' ||
    p_observed_at::text || '|' || p_unit_price_minor::text || '|' || p_wilaya_code);
  insert into public.price_observations(
    product_id,source_id,unit_price_minor,currency,observed_at,wilaya_code,commune_id,
    business_id,status,quality_flags,source_reference,source_record_key
  ) values (
    v_product_id,v_source_id,p_unit_price_minor,'DZD',p_observed_at,p_wilaya_code,p_commune_id,
    p_business_id,'pending',v_flags,'verified merchant public price submission',v_record_key
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_merchant_price_observation(uuid,text,bigint,timestamptz,text,uuid,boolean) from public, anon;
grant execute on function public.submit_merchant_price_observation(uuid,text,bigint,timestamptz,text,uuid,boolean) to authenticated;

create or replace function public.delete_my_price_contributions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_deleted integer := 0;
  v_merchant_deleted integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.price_observations where contributor_id = v_user;
  get diagnostics v_deleted = row_count;
  delete from public.price_observations o
  using public.businesses b
  where o.business_id = b.id and b.owner_id = v_user;
  get diagnostics v_merchant_deleted = row_count;
  v_deleted := v_deleted + v_merchant_deleted;
  update public.price_contributor_preferences
  set opt_in = false, updated_at = now()
  where user_id = v_user;
  perform public.refresh_price_stats(14);
  return v_deleted;
end;
$$;
revoke all on function public.delete_my_price_contributions() from public, anon;
grant execute on function public.delete_my_price_contributions() to authenticated;


-- Moderator-only review queue and source health summaries.
create table public.price_observation_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.price_observations(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('accepted','rejected')),
  reason text not null check (char_length(reason) between 1 and 1000),
  reviewed_at timestamptz not null default now()
);
create index price_observation_reviews_observation_idx
  on public.price_observation_reviews(observation_id, reviewed_at desc);
alter table public.price_observation_reviews enable row level security;
revoke all on public.price_observation_reviews from public, anon, authenticated;
grant select on public.price_observation_reviews to authenticated;
create policy "Price review audit is moderator-only"
  on public.price_observation_reviews for select to authenticated
  using (public.is_community_moderator());
revoke truncate, references, trigger on public.price_observation_reviews from anon, authenticated;

create or replace function public.get_price_source_health()
returns table (
  source_id uuid,
  source_slug text,
  source_name text,
  source_type text,
  enabled boolean,
  reviewed boolean,
  schedule text,
  last_run_at timestamptz,
  last_run_status text,
  last_rows_parsed integer,
  last_rows_accepted integer,
  pending_observations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  return query
  select s.id,s.slug,s.name,s.source_type,s.enabled,s.reviewed,s.schedule,
    r.started_at,r.status,r.rows_parsed,r.rows_accepted,
    (select count(*) from public.price_observations o where o.source_id=s.id and o.status='pending')
  from public.price_sources s
  left join lateral (
    select ir.started_at,ir.status,ir.rows_parsed,ir.rows_accepted
    from public.ingest_runs ir where ir.source_id=s.id
    order by ir.started_at desc limit 1
  ) r on true
  order by s.source_type,s.name;
end;
$$;
revoke all on function public.get_price_source_health() from public, anon;
grant execute on function public.get_price_source_health() to authenticated;

create or replace function public.list_pending_price_observations(p_limit integer default 100)
returns table (
  observation_id uuid,
  product_slug text,
  product_name text,
  source_slug text,
  source_name text,
  unit_price_minor bigint,
  observed_at timestamptz,
  wilaya_code text,
  quality_flags text[],
  source_reference text,
  ingest_run_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  return query
  select o.id,p.slug,p.name_fr,s.slug,s.name,o.unit_price_minor,o.observed_at,
    o.wilaya_code,o.quality_flags,o.source_reference,o.ingest_run_id
  from public.price_observations o
  join public.products p on p.id=o.product_id
  join public.price_sources s on s.id=o.source_id
  where o.status='pending'
  order by o.observed_at desc,o.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;
revoke all on function public.list_pending_price_observations(integer) from public, anon;
grant execute on function public.list_pending_price_observations(integer) to authenticated;

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
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid review decision'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A review reason is required'; end if;
  select source_id into v_source_id
  from public.price_observations where id=p_observation_id and status='pending';
  if v_source_id is null then raise exception 'Pending observation not found'; end if;
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
  perform public.refresh_price_stats(14);
end;
$$;
revoke all on function public.review_price_observation(uuid,text,text) from public, anon;
grant execute on function public.review_price_observation(uuid,text,text) to authenticated;
