-- 055: video channels (short/long video, P2P-assisted delivery, creator storage mirrors).
-- Invariant: a video's segments reach the PUBLIC origin bucket only after moderator approval.
-- Uploads are staged in a private bucket and handled by the server with the service role.

create table public.channel_videos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('short','long')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  locale text not null default 'fr' check (locale in ('ar','fr','en')),
  wilaya_code text check (wilaya_code is null or wilaya_code ~ '^[0-9]{2,3}$'),
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 900000),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('processing','pending','published','rejected','removed')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 300),
  manifest_path text,                 -- path of the signed manifest in the origin bucket (set on approval)
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  poster_path text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (manifest_path is not null and manifest_sha256 is not null))
);
create index channel_videos_feed_idx on public.channel_videos(status, created_at desc);
create index channel_videos_author_idx on public.channel_videos(author_id, created_at desc);
create index channel_videos_wilaya_idx on public.channel_videos(wilaya_code, status, created_at desc);

create table public.channel_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);
create index channel_follows_creator_idx on public.channel_follows(creator_id);

create table public.channel_video_likes (
  video_id uuid not null references public.channel_videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
create index channel_video_likes_user_idx on public.channel_video_likes(user_id);

create table public.channel_video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.channel_videos(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index channel_video_comments_video_idx on public.channel_video_comments(video_id, created_at);
create index channel_video_comments_author_idx on public.channel_video_comments(author_id);

create table public.channel_video_reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.channel_videos(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','abuse','illegal','sexual','violence','copyright','other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique (video_id, reporter_id)
);
create index channel_video_reports_queue_idx on public.channel_video_reports(status, created_at desc);
create index channel_video_reports_reporter_idx on public.channel_video_reports(reporter_id);

-- Creator-owned storage mirrors (S3-compatible, e.g. Cloudflare R2). Additional storage only.
create table public.channel_storage_mirrors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('r2','s3')),
  label text not null check (char_length(label) between 1 and 60),
  endpoint_host text not null check (char_length(endpoint_host) between 4 and 255),
  bucket text not null check (bucket ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'),
  public_base_url text not null check (public_base_url ~ '^https://'),
  credentials_ciphertext text not null,        -- AES-256-GCM, server key; never readable by clients
  status text not null default 'pending_check' check (status in ('pending_check','healthy','degraded','down','disconnected')),
  last_check_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  unique (owner_id, label)
);
create index channel_storage_mirrors_owner_idx on public.channel_storage_mirrors(owner_id);

create table public.channel_video_mirror_copies (
  video_id uuid not null references public.channel_videos(id) on delete cascade,
  mirror_id uuid not null references public.channel_storage_mirrors(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','copied','failed','deleted')),
  updated_at timestamptz not null default now(),
  primary key (video_id, mirror_id)
);
create index channel_video_mirror_copies_mirror_idx on public.channel_video_mirror_copies(mirror_id);

-- Per-user opt-in relaying settings. Off by default.
create table public.channel_sharing_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sharing_enabled boolean not null default false,
  wifi_only boolean not null default true,
  daily_upload_cap_mb integer not null default 500 check (daily_upload_cap_mb between 0 and 5000),
  min_battery_pct smallint not null default 30 check (min_battery_pct between 0 and 100),
  cache_mb integer not null default 300 check (cache_mb between 0 and 2000),
  data_saver boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Playback measurements for the Phase-0 / pilot gate (bytes by source). Own rows only.
create table public.channel_playback_stats (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.channel_videos(id) on delete cascade,
  bytes_origin bigint not null default 0 check (bytes_origin >= 0),
  bytes_mirror bigint not null default 0 check (bytes_mirror >= 0),
  bytes_peer bigint not null default 0 check (bytes_peer >= 0),
  rejected_pieces integer not null default 0 check (rejected_pieces >= 0),
  created_at timestamptz not null default now()
);
create index channel_playback_stats_video_idx on public.channel_playback_stats(video_id, created_at desc);
create index channel_playback_stats_viewer_idx on public.channel_playback_stats(viewer_id);

-- Row level security ---------------------------------------------------------------------
alter table public.channel_videos enable row level security;
alter table public.channel_follows enable row level security;
alter table public.channel_video_likes enable row level security;
alter table public.channel_video_comments enable row level security;
alter table public.channel_video_reports enable row level security;
alter table public.channel_storage_mirrors enable row level security;
alter table public.channel_video_mirror_copies enable row level security;
alter table public.channel_sharing_settings enable row level security;
alter table public.channel_playback_stats enable row level security;

revoke all on public.channel_videos, public.channel_follows, public.channel_video_likes, public.channel_video_comments,
  public.channel_video_reports, public.channel_storage_mirrors, public.channel_video_mirror_copies,
  public.channel_sharing_settings, public.channel_playback_stats from public, anon, authenticated;

grant select on public.channel_videos to anon, authenticated;
grant select, insert, delete on public.channel_follows to authenticated;
grant select, insert, delete on public.channel_video_likes to authenticated;
grant select, insert, delete on public.channel_video_comments to authenticated;
grant select, insert on public.channel_video_reports to authenticated;
grant update (status) on public.channel_video_reports to authenticated;
-- Mirrors: the client may list its own mirrors WITHOUT the credential column; writes go through the server.
grant select (id, owner_id, provider, label, endpoint_host, bucket, public_base_url, status, last_check_at, last_error, created_at)
  on public.channel_storage_mirrors to authenticated;
grant select on public.channel_video_mirror_copies to authenticated;
grant select, insert, update on public.channel_sharing_settings to authenticated;
grant select, insert on public.channel_playback_stats to authenticated;

-- Videos: published ones are public unless blocked; authors always see their own; moderators see everything.
-- Inserts/updates happen only in the server (service role) after ffmpeg + hashing + review.
create policy "Published videos visible unless blocked" on public.channel_videos
  for select to anon, authenticated
  using (
    (status = 'published' and public.community_can_view_author(author_id))
    or author_id = (select auth.uid())
    or public.is_community_moderator()
  );

create policy "Follows are private to the follower" on public.channel_follows
  for select to authenticated using (follower_id = (select auth.uid()));
create policy "Users follow as themselves" on public.channel_follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "Users unfollow as themselves" on public.channel_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create policy "Likes on visible videos readable" on public.channel_video_likes
  for select to authenticated
  using (exists (select 1 from public.channel_videos v where v.id = video_id));
create policy "Users like as themselves" on public.channel_video_likes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.channel_videos v where v.id = video_id and v.status = 'published')
  );
create policy "Users remove their like" on public.channel_video_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Comments on visible videos readable" on public.channel_video_comments
  for select to authenticated
  using (public.community_can_view_author(author_id)
    and exists (select 1 from public.channel_videos v where v.id = video_id));
create policy "Users comment as themselves" on public.channel_video_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and public.community_text_is_safe(body)
    and exists (select 1 from public.channel_videos v where v.id = video_id and v.status = 'published')
  );
create policy "Authors delete their comments" on public.channel_video_comments
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_community_moderator());

create policy "Users report as themselves" on public.channel_video_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.channel_videos v where v.id = video_id and v.status = 'published')
  );
create policy "Reporters and moderators read reports" on public.channel_video_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.is_community_moderator());
create policy "Moderators resolve reports" on public.channel_video_reports
  for update to authenticated using (public.is_community_moderator()) with check (public.is_community_moderator());

create policy "Owners read their mirrors" on public.channel_storage_mirrors
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners read their mirror copies" on public.channel_video_mirror_copies
  for select to authenticated
  using (exists (select 1 from public.channel_storage_mirrors m where m.id = mirror_id and m.owner_id = (select auth.uid())));

create policy "Users read their sharing settings" on public.channel_sharing_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their sharing settings" on public.channel_sharing_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update their sharing settings" on public.channel_sharing_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Viewers read their own stats" on public.channel_playback_stats
  for select to authenticated using (viewer_id = (select auth.uid()));
create policy "Viewers record their own stats" on public.channel_playback_stats
  for insert to authenticated with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from public.channel_videos v where v.id = video_id and v.status = 'published')
  );

-- Removal is moderator-only and goes through one audited function.
create or replace function public.channel_moderate_video(p_video_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_community_moderator() then
    raise exception 'moderator only' using errcode = '42501';
  end if;
  if p_decision not in ('rejected','removed') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  update public.channel_videos
     set status = p_decision, rejection_reason = left(p_reason, 300),
         reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
   where id = p_video_id;
end;
$$;
revoke all on function public.channel_moderate_video(uuid, text, text) from public, anon;
grant execute on function public.channel_moderate_video(uuid, text, text) to authenticated;

-- Buckets: staging is private (service role only); origin is public read, written only after approval.
insert into storage.buckets (id, name, public) values ('channel-staging', 'channel-staging', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('channel-origin', 'channel-origin', true)
  on conflict (id) do nothing;
