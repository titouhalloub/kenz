create table if not exists public.kenz_channel_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.kenz_channel_posts(id) on delete cascade,
  channel_id uuid not null references public.kenz_channels(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'other' check (reason in ('spam','harassment','misinformation','unsafe','copyright','other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewed','actioned')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(post_id, reporter_id)
);
create index if not exists kenz_channel_reports_owner_idx on public.kenz_channel_post_reports(channel_id,status,created_at desc);
alter table public.kenz_channel_post_reports enable row level security;
drop policy if exists "Members report public channel posts" on public.kenz_channel_post_reports;
create policy "Members report public channel posts" on public.kenz_channel_post_reports
for insert to authenticated with check (
  reporter_id = (select auth.uid()) and exists (
    select 1 from public.kenz_channel_posts p
    join public.kenz_channels c on c.id = p.channel_id
    where p.id = post_id and p.channel_id = channel_id and c.is_public
  )
);
drop policy if exists "Reporters and channel owners read reports" on public.kenz_channel_post_reports;
create policy "Reporters and channel owners read reports" on public.kenz_channel_post_reports
for select to authenticated using (
  reporter_id = (select auth.uid()) or exists (
    select 1 from public.kenz_channels c
    where c.id = channel_id and c.owner_id = (select auth.uid())
  )
);
drop policy if exists "Channel owners review reports" on public.kenz_channel_post_reports;
create policy "Channel owners review reports" on public.kenz_channel_post_reports
for update to authenticated using (
  exists (select 1 from public.kenz_channels c where c.id = channel_id and c.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.kenz_channels c where c.id = channel_id and c.owner_id = (select auth.uid()))
  and reviewed_by = (select auth.uid())
);
grant select, insert, update on public.kenz_channel_post_reports to authenticated;
revoke all on public.kenz_channel_post_reports from anon;