-- 047: remove the aggregate view because it bypasses follower-row RLS.
drop view if exists public.kenz_channel_follower_counts;
create index if not exists kenz_channel_post_comments_author_idx
  on public.kenz_channel_post_comments(author_id);
