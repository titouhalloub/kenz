-- 056: anon could not read published videos (401): the select policy called is_community_moderator(),
-- which migration 044 revoked from anon. Split into an anon-safe policy and an authenticated one.
drop policy if exists "Published videos visible unless blocked" on public.channel_videos;
drop policy if exists "Authors and moderators read all their videos" on public.channel_videos;

create policy "Published videos visible unless blocked" on public.channel_videos
  for select to anon, authenticated
  using (status = 'published' and public.community_can_view_author(author_id));

create policy "Authors and moderators read all their videos" on public.channel_videos
  for select to authenticated
  using (author_id = (select auth.uid()) or public.is_community_moderator());
