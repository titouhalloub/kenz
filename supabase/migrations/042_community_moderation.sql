-- 042: moderation, reporting, blocking, and guarded community write RPCs.
create table public.community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator','admin')),
  created_at timestamptz not null default now()
);
create table public.community_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','personal_information','misinformation','other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index community_reports_queue_idx on public.community_reports(status, created_at desc);
create index community_user_blocks_blocked_idx on public.community_user_blocks(blocked_id);

create table public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null check (target_type in ('post','comment','report','user')),
  target_id uuid not null,
  action text not null check (action in ('publish','hide','reject','restore','resolve','dismiss','warn','block')),
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index community_moderation_actions_target_idx
  on public.community_moderation_actions(target_type, target_id, created_at desc);

alter table public.community_moderators enable row level security;
alter table public.community_user_blocks enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_actions enable row level security;

revoke all on public.community_moderators, public.community_user_blocks,
  public.community_reports, public.community_moderation_actions from public, anon, authenticated;
grant select, insert, delete on public.community_user_blocks to authenticated;
grant insert on public.community_reports to authenticated;
grant select, update on public.community_reports to authenticated;
grant select on public.community_moderation_actions to authenticated;

revoke truncate, references, trigger on public.community_moderators, public.community_user_blocks,
  public.community_reports, public.community_moderation_actions from anon, authenticated;

create or replace function public.is_community_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_moderators m
    where m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_community_moderator() from public, anon;
grant execute on function public.is_community_moderator() to anon, authenticated;


create or replace function public.community_can_view_author(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select (select auth.uid()) is null or not exists (
    select 1 from public.community_user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_author_id)
       or (b.blocker_id = p_author_id and b.blocked_id = (select auth.uid()))
  );
$;
revoke all on function public.community_can_view_author(uuid) from public;
grant execute on function public.community_can_view_author(uuid) to anon, authenticated;

create or replace function public.community_text_is_safe(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(length(p_text), 0) > 0
    and p_text !~* '(https?://|www\\.)'
    and p_text !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
    and p_text !~* '(\\+?213|0)[567][0-9 .-]{7,}'
$$;
revoke all on function public.community_text_is_safe(text) from public, anon, authenticated;

-- Public posts are visible only when published and not blocked in either direction.
create policy "Public profiles are visible by consent" on public.community_profiles
for select to anon, authenticated using (is_public or user_id = (select auth.uid()));
create policy "Users create their own community profile" on public.community_profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update their own community profile" on public.community_profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Published posts visible unless blocked" on public.community_posts
for select to anon, authenticated using (
  (status = 'published' and public.community_can_view_author(author_id))
  or author_id = (select auth.uid())
  or public.is_community_moderator()
);
create policy "Authors update their own posts" on public.community_posts
for update to authenticated using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));
create policy "Authors delete their own posts" on public.community_posts
for delete to authenticated using (author_id = (select auth.uid()));

create policy "Visible recipes are readable" on public.community_recipes
for select to anon, authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id)
);
create policy "Authors manage their recipe" on public.community_recipes
for all to authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()))
) with check (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.kind = 'recipe')
);

create policy "Visible recipe ingredients are readable" on public.community_recipe_ingredients
for select to anon, authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id)
);
create policy "Authors manage recipe ingredients" on public.community_recipe_ingredients
for all to authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()))
) with check (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.kind = 'recipe')
);

create policy "Visible shopping items are readable" on public.community_shopping_items
for select to anon, authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id)
);
create policy "Authors manage shopping items" on public.community_shopping_items
for all to authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()))
) with check (
  exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()) and p.kind = 'shopping_list')
);

create policy "Visible comments are readable" on public.community_comments
for select to anon, authenticated using (
  (status = 'published' and exists (select 1 from public.community_posts p where p.id = post_id))
  or author_id = (select auth.uid())
  or public.is_community_moderator()
);
create policy "Authors update their comments" on public.community_comments
for update to authenticated using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));
create policy "Authors delete their comments" on public.community_comments
for delete to authenticated using (author_id = (select auth.uid()));

create policy "Reactions on visible posts are readable" on public.community_reactions
for select to anon, authenticated using (
  exists (select 1 from public.community_posts p where p.id = post_id)
);
create policy "Users react to visible posts" on public.community_reactions
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'published')
);
create policy "Users remove their reactions" on public.community_reactions
for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users read their own saves" on public.community_saves
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users save visible posts" on public.community_saves
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'published')
);
create policy "Users remove their own saves" on public.community_saves
for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users manage their own blocks" on public.community_user_blocks
for all to authenticated using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
create policy "Users submit reports" on public.community_reports
for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Moderators read reports" on public.community_reports
for select to authenticated using (public.is_community_moderator());
create policy "Moderators resolve reports" on public.community_reports
for update to authenticated using (public.is_community_moderator())
with check (public.is_community_moderator());
create policy "Moderators read moderation audit" on public.community_moderation_actions
for select to authenticated using (public.is_community_moderator());

-- Authors cannot publish, hide, reject, or reassign posts by editing their own row.
create or replace function public.guard_community_post_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id <> old.author_id or new.kind <> old.kind then
    raise exception 'Community post author and kind are immutable';
  end if;
  if new.status <> old.status and not public.is_community_moderator() then
    raise exception 'Only moderators can change post status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_community_post_update() from public, anon, authenticated;
create trigger guard_community_post_update
before update on public.community_posts
for each row execute function public.guard_community_post_update();

create or replace function public.create_community_post(
  p_kind text, p_title text, p_body text, p_locale text, p_wilaya_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_kind not in ('recipe','shopping_list','tip') then raise exception 'Invalid post kind'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 120 then raise exception 'Title must contain 3–120 characters'; end if;
  if length(coalesce(p_body,'')) > 5000 or not public.community_text_is_safe(trim(coalesce(p_title,'')) || ' ' || coalesce(p_body,'')) then
    raise exception 'Remove links, email addresses and phone numbers from public posts';
  end if;
  if p_locale not in ('ar','fr','en') then raise exception 'Invalid locale'; end if;
  if p_wilaya_code is not null and p_wilaya_code !~ '^[0-9]{2,3}$' then raise exception 'Invalid wilaya code'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if (select count(*) from public.community_posts where author_id = v_user and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Post limit reached; try again tomorrow';
  end if;

  insert into public.community_posts(author_id,kind,title,body,locale,wilaya_code,status)
  values (v_user,p_kind,trim(p_title),coalesce(p_body,''),p_locale,p_wilaya_code,'published')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_community_post(text,text,text,text,text) from public, anon;
grant execute on function public.create_community_post(text,text,text,text,text) to authenticated;

create or replace function public.create_community_comment(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_body,''))) not between 1 and 2000
     or not public.community_text_is_safe(trim(coalesce(p_body,''))) then
    raise exception 'Comment is empty or contains a link, email address or phone number';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if (select count(*) from public.community_comments where author_id = v_user and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Comment limit reached; try again later';
  end if;
  if not exists (select 1 from public.community_posts where id = p_post_id and status = 'published') then
    raise exception 'Post is not available';
  end if;
  insert into public.community_comments(post_id,author_id,body,status)
  values (p_post_id,v_user,trim(p_body),'published') returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_community_comment(uuid,text) from public, anon;
grant execute on function public.create_community_comment(uuid,text) to authenticated;

create or replace function public.moderate_community_post(p_post_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_status not in ('published','hidden','rejected') then raise exception 'Invalid moderation status'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A moderation reason is required'; end if;
  update public.community_posts set status = p_status where id = p_post_id;
  if not found then raise exception 'Post not found'; end if;
  insert into public.community_moderation_actions(moderator_id,target_type,target_id,action,reason)
  values (v_user,'post',p_post_id,case p_status when 'published' then 'publish' when 'hidden' then 'hide' else 'reject' end,trim(p_reason));
end;
$$;
revoke all on function public.moderate_community_post(uuid,text,text) from public, anon;
grant execute on function public.moderate_community_post(uuid,text,text) to authenticated;

create or replace function public.resolve_community_report(p_report_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'Invalid report status'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A resolution reason is required'; end if;
  update public.community_reports set status=p_status,resolved_at=now(),resolved_by=v_user where id=p_report_id;
  if not found then raise exception 'Report not found'; end if;
  insert into public.community_moderation_actions(moderator_id,target_type,target_id,action,reason)
  values (v_user,'report',p_report_id,case p_status when 'resolved' then 'resolve' else 'dismiss' end,trim(p_reason));
end;
$$;
revoke all on function public.resolve_community_report(uuid,text,text) from public, anon;
grant execute on function public.resolve_community_report(uuid,text,text) to authenticated;


create or replace function public.guard_community_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id <> old.author_id or new.post_id <> old.post_id then
    raise exception 'Comment author and post are immutable';
  end if;
  if new.status <> old.status and not public.is_community_moderator() then
    raise exception 'Only moderators can change comment status';
  end if;
  if not public.community_text_is_safe(trim(coalesce(new.body,''))) then
    raise exception 'Remove links, email addresses and phone numbers from public comments';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_community_comment_update() from public, anon, authenticated;
create trigger guard_community_comment_update
before update on public.community_comments
for each row execute function public.guard_community_comment_update();

create or replace function public.moderate_community_comment(p_comment_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.is_community_moderator() then raise exception 'Moderator access required'; end if;
  if p_status not in ('published','hidden') then raise exception 'Invalid moderation status'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A moderation reason is required'; end if;
  update public.community_comments set status=p_status where id=p_comment_id;
  if not found then raise exception 'Comment not found'; end if;
  insert into public.community_moderation_actions(moderator_id,target_type,target_id,action,reason)
  values (v_user,'comment',p_comment_id,case p_status when 'published' then 'restore' else 'hide' end,trim(p_reason));
end;
$$;
revoke all on function public.moderate_community_comment(uuid,text,text) from public, anon;
grant execute on function public.moderate_community_comment(uuid,text,text) to authenticated;

create or replace function public.validate_community_report_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_type = 'post' and not exists (select 1 from public.community_posts where id = new.target_id) then
    raise exception 'Post not found';
  elsif new.target_type = 'comment' and not exists (select 1 from public.community_comments where id = new.target_id) then
    raise exception 'Comment not found';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_community_report_target() from public, anon, authenticated;
create trigger validate_community_report_target
before insert on public.community_reports
for each row execute function public.validate_community_report_target();
