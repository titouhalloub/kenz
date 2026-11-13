-- 050: enable realtime delivery for channel discovery and follower feeds.
-- Idempotent: only add tables that are not already members of supabase_realtime.
do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is not available; skipping channel realtime registration';
    return;
  end if;
  foreach target_table in array array[
    'kenz_channels',
    'kenz_channel_follows',
    'kenz_channel_posts',
    'kenz_channel_post_reactions',
    'kenz_channel_post_comments'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
