-- 046: creator channels and channel-native social feed.
-- Media bytes are intentionally not stored here; this schema stores channel/post metadata only.
create table if not exists public.kenz_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 48),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'general' check (char_length(category) <= 40),
  avatar_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kenz_channels_owner_created_idx on public.kenz_channels(owner_id, created_at desc);
create index if not exists kenz_channels_public_created_idx on public.kenz_channels(is_public, created_at desc);

create table if not exists public.kenz_channel_follows (
  channel_id uuid not null references public.kenz_channels(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(channel_id, follower_id)
);
create index if not exists kenz_channel_follows_follower_idx on public.kenz_channel_follows(follower_id, created_at desc);

create table if not exists public.kenz_channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.kenz_channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  media_kind text not null default 'none' check (media_kind in ('none','image','video')),
  media_name text,
  media_mime_type text,
  media_size_bytes bigint check (media_size_bytes is null or media_size_bytes between 1 and 26214400),
  peer_available_until timestamptz,
  created_at timestamptz not null default now(),
  constraint kenz_channel_posts_media_metadata check (
    (media_kind = 'none' and media_name is null and media_mime_type is null and media_size_bytes is null)
    or (media_kind <> 'none' and media_name is not null and media_mime_type is not null and media_size_bytes is not null)
  )
);
create index if not exists kenz_channel_posts_feed_idx on public.kenz_channel_posts(channel_id, created_at desc);
create index if not exists kenz_channel_posts_author_idx on public.kenz_channel_posts(author_id, created_at desc);

create table if not exists public.kenz_channel_post_reactions (
  post_id uuid not null references public.kenz_channel_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like')),
  created_at timestamptz not null default now(),
  primary key(post_id, user_id)
);
create index if not exists kenz_channel_post_reactions_user_idx on public.kenz_channel_post_reactions(user_id, created_at desc);

create table if not exists public.kenz_channel_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.kenz_channel_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists kenz_channel_post_comments_feed_idx on public.kenz_channel_post_comments(post_id, created_at asc);

alter table public.kenz_channels enable row level security;
alter table public.kenz_channel_follows enable row level security;
alter table public.kenz_channel_posts enable row level security;
alter table public.kenz_channel_post_reactions enable row level security;
alter table public.kenz_channel_post_comments enable row level security;

drop policy if exists "Public channels are discoverable" on public.kenz_channels;
create policy "Public channels are discoverable" on public.kenz_channels
for select to authenticated using (is_public or owner_id = (select auth.uid()));
drop policy if exists "Owners create channels" on public.kenz_channels;
create policy "Owners create channels" on public.kenz_channels
for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Owners update channels" on public.kenz_channels;
create policy "Owners update channels" on public.kenz_channels
for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owners delete channels" on public.kenz_channels;
create policy "Owners delete channels" on public.kenz_channels
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Followers are visible to channel members" on public.kenz_channel_follows;
create policy "Followers are visible to channel members" on public.kenz_channel_follows
for select to authenticated using (
  follower_id = (select auth.uid()) or exists (
    select 1 from public.kenz_channels c where c.id = channel_id and c.owner_id = (select auth.uid())
  )
);
drop policy if exists "Users follow channels as themselves" on public.kenz_channel_follows;
create policy "Users follow channels as themselves" on public.kenz_channel_follows
for insert to authenticated with check (
  follower_id = (select auth.uid()) and exists (
    select 1 from public.kenz_channels c where c.id = channel_id and c.is_public
  )
);
drop policy if exists "Users unfollow as themselves" on public.kenz_channel_follows;
create policy "Users unfollow as themselves" on public.kenz_channel_follows
for delete to authenticated using (follower_id = (select auth.uid()));

drop policy if exists "Published channel posts are readable" on public.kenz_channel_posts;
create policy "Published channel posts are readable" on public.kenz_channel_posts
for select to authenticated using (exists (
  select 1 from public.kenz_channels c where c.id = channel_id and (c.is_public or c.owner_id = (select auth.uid()))
));
drop policy if exists "Channel owners publish posts" on public.kenz_channel_posts;
create policy "Channel owners publish posts" on public.kenz_channel_posts
for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (
    select 1 from public.kenz_channels c where c.id = channel_id and c.owner_id = (select auth.uid())
  )
);
drop policy if exists "Authors delete own channel posts" on public.kenz_channel_posts;
create policy "Authors delete own channel posts" on public.kenz_channel_posts
for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "Channel reactions are readable" on public.kenz_channel_post_reactions;
create policy "Channel reactions are readable" on public.kenz_channel_post_reactions
for select to authenticated using (exists (
  select 1 from public.kenz_channel_posts p join public.kenz_channels c on c.id=p.channel_id
  where p.id=post_id and (c.is_public or c.owner_id=(select auth.uid()))
));
drop policy if exists "Users react as themselves" on public.kenz_channel_post_reactions;
create policy "Users react as themselves" on public.kenz_channel_post_reactions
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users remove own reactions" on public.kenz_channel_post_reactions;
create policy "Users remove own reactions" on public.kenz_channel_post_reactions
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Channel comments are readable" on public.kenz_channel_post_comments;
create policy "Channel comments are readable" on public.kenz_channel_post_comments
for select to authenticated using (exists (
  select 1 from public.kenz_channel_posts p join public.kenz_channels c on c.id=p.channel_id
  where p.id=post_id and (c.is_public or c.owner_id=(select auth.uid()))
));
drop policy if exists "Users comment as themselves" on public.kenz_channel_post_comments;
create policy "Users comment as themselves" on public.kenz_channel_post_comments
for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (
    select 1 from public.kenz_channel_posts p join public.kenz_channels c on c.id=p.channel_id
    where p.id=post_id and c.is_public
  )
);
drop policy if exists "Authors delete own comments" on public.kenz_channel_post_comments;
create policy "Authors delete own comments" on public.kenz_channel_post_comments
for delete to authenticated using (author_id = (select auth.uid()));

grant select, insert, update, delete on public.kenz_channels to authenticated;
grant select, insert, delete on public.kenz_channel_follows to authenticated;
grant select, insert, delete on public.kenz_channel_posts to authenticated;
grant select, insert, delete on public.kenz_channel_post_reactions to authenticated;
grant select, insert, delete on public.kenz_channel_post_comments to authenticated;
revoke all on public.kenz_channels, public.kenz_channel_follows, public.kenz_channel_posts,
  public.kenz_channel_post_reactions, public.kenz_channel_post_comments from anon;
