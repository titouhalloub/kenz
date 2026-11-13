-- Correctly qualify the outer Storage object name in media policies.
drop policy if exists "Public channel media can be read by members" on storage.objects;
create policy "Public channel media can be read by members"
on storage.objects for select to authenticated
using (
  bucket_id='kenz-channel-media'
  and exists (
    select 1 from public.kenz_channels c
    where c.id::text=(storage.foldername(storage.objects.name))[1]
      and (c.is_public or c.owner_id=(select auth.uid()))
  )
);
drop policy if exists "Channel owners upload their media" on storage.objects;
create policy "Channel owners upload their media"
on storage.objects for insert to authenticated
with check (
  bucket_id='kenz-channel-media'
  and (storage.foldername(storage.objects.name))[2]=(select auth.uid())::text
  and exists (
    select 1 from public.kenz_channels c
    where c.id::text=(storage.foldername(storage.objects.name))[1]
      and c.owner_id=(select auth.uid())
  )
);
drop policy if exists "Channel owners delete their media" on storage.objects;
create policy "Channel owners delete their media"
on storage.objects for delete to authenticated
using (
  bucket_id='kenz-channel-media'
  and (storage.foldername(storage.objects.name))[2]=(select auth.uid())::text
  and exists (
    select 1 from public.kenz_channels c
    where c.id::text=(storage.foldername(storage.objects.name))[1]
      and c.owner_id=(select auth.uid())
  )
);