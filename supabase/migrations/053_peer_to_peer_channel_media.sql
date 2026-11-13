-- Channel post media is peer-to-peer; only metadata remains in Postgres.
drop policy if exists "Public channel media can be read by members" on storage.objects;
drop policy if exists "Channel owners upload their media" on storage.objects;
drop policy if exists "Channel owners delete their media" on storage.objects;
alter table public.kenz_channel_posts drop column if exists media_path;

drop policy if exists "Kenz channel media members can receive realtime" on realtime.messages;
create policy "Kenz channel media members can receive realtime"
on realtime.messages for select to authenticated
using (
  extension in ('broadcast','presence')
  and (select realtime.topic()) ~ '^kenz-media:[0-9a-f-]{36}$'
  and exists (
    select 1 from public.kenz_channels c
    where c.id::text=split_part((select realtime.topic()),':',2)
      and (
        c.owner_id=(select auth.uid())
        or exists(select 1 from public.kenz_channel_follows f
          where f.channel_id=c.id and f.follower_id=(select auth.uid()))
      )
  )
);
drop policy if exists "Kenz channel media members can send realtime" on realtime.messages;
create policy "Kenz channel media members can send realtime"
on realtime.messages for insert to authenticated
with check (
  extension in ('broadcast','presence')
  and (select realtime.topic()) ~ '^kenz-media:[0-9a-f-]{36}$'
  and exists (
    select 1 from public.kenz_channels c
    where c.id::text=split_part((select realtime.topic()),':',2)
      and (
        c.owner_id=(select auth.uid())
        or exists(select 1 from public.kenz_channel_follows f
          where f.channel_id=c.id and f.follower_id=(select auth.uid()))
      )
  )
);