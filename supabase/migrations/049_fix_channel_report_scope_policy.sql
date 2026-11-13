drop policy if exists "Members report public channel posts" on public.kenz_channel_post_reports;
create policy "Members report public channel posts" on public.kenz_channel_post_reports
for insert to authenticated with check (
  reporter_id = (select auth.uid()) and exists (
    select 1 from public.kenz_channel_posts p
    join public.kenz_channels c on c.id = p.channel_id
    where p.id = kenz_channel_post_reports.post_id
      and p.channel_id = kenz_channel_post_reports.channel_id
      and c.is_public
  )
);