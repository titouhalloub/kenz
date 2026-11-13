-- LiveKit SFU room metadata and private channel media storage.
alter table public.kenz_channel_posts add column if not exists media_path text;
create table if not exists public.kenz_channel_live_rooms (
 id uuid primary key default gen_random_uuid(),
 channel_id uuid not null references public.kenz_channels(id) on delete cascade,
 host_id uuid not null references auth.users(id) on delete cascade,
 room_name text not null unique,
 title text not null check (char_length(title) between 1 and 120),
 status text not null default 'live' check (status in ('live','ended')),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists kenz_channel_live_rooms_status_started_idx on public.kenz_channel_live_rooms(status, started_at desc);
create index if not exists kenz_channel_live_rooms_channel_idx on public.kenz_channel_live_rooms(channel_id, status);
alter table public.kenz_channel_live_rooms enable row level security;
drop policy if exists "Live rooms are visible for public channels" on public.kenz_channel_live_rooms;
create policy "Live rooms are visible for public channels" on public.kenz_channel_live_rooms for select to authenticated
using (host_id=(select auth.uid()) or (status='live' and exists(select 1 from public.kenz_channels c where c.id=channel_id and c.is_public)));
drop policy if exists "Channel owners start live rooms" on public.kenz_channel_live_rooms;
create policy "Channel owners start live rooms" on public.kenz_channel_live_rooms for insert to authenticated
with check (host_id=(select auth.uid()) and exists(select 1 from public.kenz_channels c where c.id=channel_id and c.owner_id=(select auth.uid())));
drop policy if exists "Channel owners end live rooms" on public.kenz_channel_live_rooms;
create policy "Channel owners end live rooms" on public.kenz_channel_live_rooms for update to authenticated
using (host_id=(select auth.uid()) and exists(select 1 from public.kenz_channels c where c.id=channel_id and c.owner_id=(select auth.uid())))
with check (host_id=(select auth.uid()) and exists(select 1 from public.kenz_channels c where c.id=channel_id and c.owner_id=(select auth.uid())));
grant select,insert,update on public.kenz_channel_live_rooms to authenticated;
grant select,insert,update on public.kenz_channel_posts to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kenz-channel-media','kenz-channel-media',false,209715200,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=209715200,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public channel media can be read by members" on storage.objects;
create policy "Public channel media can be read by members" on storage.objects for select to authenticated
using(bucket_id='kenz-channel-media' and exists(select 1 from public.kenz_channels c where c.id::text=(storage.foldername(name))[1] and (c.is_public or c.owner_id=(select auth.uid()))));
drop policy if exists "Channel owners upload their media" on storage.objects;
create policy "Channel owners upload their media" on storage.objects for insert to authenticated
with check(bucket_id='kenz-channel-media' and (storage.foldername(name))[2]=(select auth.uid())::text and exists(select 1 from public.kenz_channels c where c.id::text=(storage.foldername(name))[1] and c.owner_id=(select auth.uid())));
drop policy if exists "Channel owners delete their media" on storage.objects;
create policy "Channel owners delete their media" on storage.objects for delete to authenticated
using(bucket_id='kenz-channel-media' and (storage.foldername(name))[2]=(select auth.uid())::text and exists(select 1 from public.kenz_channels c where c.id::text=(storage.foldername(name))[1] and c.owner_id=(select auth.uid())));
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kenz_channel_live_rooms') then
  alter publication supabase_realtime add table public.kenz_channel_live_rooms;
 end if;
end $$;