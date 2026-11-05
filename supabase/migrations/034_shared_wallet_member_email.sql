-- Include member email in the owner-visible membership roster without exposing profiles.
alter table public.shared_wallet_members add column if not exists member_email text;

update public.shared_wallet_members m
set member_email = lower(p.email)
from public.profiles p
where p.id = m.user_id and m.member_email is null;

alter table public.shared_wallet_members alter column member_email set not null;

create or replace function public.add_shared_wallet_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shared_wallet_members(wallet_id, user_id, owner_id, member_email, role)
  select new.id, new.owner_id, new.owner_id, lower(p.email), 'owner'
  from public.profiles p
  where p.id = new.owner_id;
  return new;
end;
$$;

drop policy if exists "Owners add invited members" on public.shared_wallet_members;
create policy "Owners add invited members"
on public.shared_wallet_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and (
    (
      role in ('editor', 'viewer')
      and exists (
        select 1 from public.shared_wallet_invites i
        where i.wallet_id = shared_wallet_members.wallet_id
          and i.owner_id = shared_wallet_members.owner_id
          and i.invitee_email = member_email
          and i.role = shared_wallet_members.role
          and i.status = 'pending'
      )
    )
  )
);

create or replace function public.guard_shared_wallet_membership_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.wallet_id <> old.wallet_id
     or new.user_id <> old.user_id
     or new.owner_id <> old.owner_id
     or new.member_email <> old.member_email
     or old.role = 'owner' then
    raise exception 'Shared wallet membership identity is immutable';
  end if;
  if new.role not in ('editor', 'viewer') then
    raise exception 'Invalid shared wallet role';
  end if;
  return new;
end;
$$;

revoke all on function public.add_shared_wallet_owner_membership() from public, anon, authenticated;
revoke all on function public.guard_shared_wallet_membership_update() from public, anon, authenticated;
