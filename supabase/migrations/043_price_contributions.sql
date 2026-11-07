-- 043: explicit-consent crowd price submissions with review and erasure controls.
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
create policy "Contributors manage their own preference" on public.price_contributor_preferences
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
revoke truncate, references, trigger on public.price_contributor_preferences from anon, authenticated;

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
  v_base_unit text;
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
  if p_wilaya_code !~ '^[0-9]{2,3}$' then raise exception 'Valid wilaya code is required'; end if;

  select id, base_unit into v_product_id, v_base_unit
  from public.products where slug = p_product_slug and is_active = true;
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
  ) then
    raise exception 'You have already submitted this product for that date';
  end if;

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
  if v_median is not null and
     (p_unit_price_minor < greatest(1, v_median / 4) or p_unit_price_minor > v_median * 4) then
    v_flags := array_append(v_flags, 'outside_reference_range');
  end if;

  insert into public.price_contributor_preferences(user_id,opt_in,consented_at,updated_at)
  values (v_user,true,now(),now())
  on conflict (user_id) do update set opt_in=true,consented_at=now(),updated_at=now();

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

create or replace function public.delete_my_price_contributions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.price_observations where contributor_id = v_user;
  get diagnostics v_deleted = row_count;
  update public.price_contributor_preferences set opt_in=false,updated_at=now() where user_id=v_user;
  perform public.refresh_price_stats(14);
  return v_deleted;
end;
$$;
revoke all on function public.delete_my_price_contributions() from public, anon;
grant execute on function public.delete_my_price_contributions() to authenticated;
