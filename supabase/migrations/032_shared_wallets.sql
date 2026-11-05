-- Point 6: Shared Wallets
create table if not exists public.shared_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  currency varchar(8) not null default 'DZD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_wallet_members (
  wallet_id uuid not null references public.shared_wallets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (wallet_id, user_id),
  constraint shared_wallet_member_owner_role_check check ((role = 'owner') = (user_id = owner_id))
);

create table if not exists public.shared_wallet_invites (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.shared_wallets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text not null check (invitee_email = lower(trim(invitee_email))),
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists shared_wallet_one_pending_invite
  on public.shared_wallet_invites(wallet_id, invitee_email) where status = 'pending';
create index if not exists shared_wallet_members_user_idx on public.shared_wallet_members(user_id);
create index if not exists shared_wallet_invites_email_idx on public.shared_wallet_invites(invitee_email, status);

create table if not exists public.shared_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.shared_wallets(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0),
  currency varchar(8) not null,
  description text not null check (char_length(trim(description)) between 1 and 180),
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);


create index if not exists shared_wallet_entries_wallet_date_idx on public.shared_wallet_entries(wallet_id, transaction_date desc);
alter table public.shared_wallets enable row level security;
alter table public.shared_wallet_members enable row level security;
alter table public.shared_wallet_invites enable row level security;
alter table public.shared_wallet_entries enable row level security;

drop policy if exists "Shared wallet members can view their wallets" on public.shared_wallets;
create policy "Shared wallet members can view their wallets"
on public.shared_wallets for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallets.id and m.user_id = (select auth.uid())
  )
);

drop policy if exists "Users create owned shared wallets" on public.shared_wallets;
create policy "Users create owned shared wallets"
on public.shared_wallets for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "Owners update shared wallets" on public.shared_wallets;
create policy "Owners update shared wallets"
on public.shared_wallets for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Owners delete shared wallets" on public.shared_wallets;
create policy "Owners delete shared wallets"
on public.shared_wallets for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Members view shared wallet memberships" on public.shared_wallet_members;
create policy "Members view shared wallet memberships"
on public.shared_wallet_members for select to authenticated
using (user_id = (select auth.uid()) or owner_id = (select auth.uid()));

drop policy if exists "Owners add invited members" on public.shared_wallet_members;
create policy "Owners add invited members"
on public.shared_wallet_members for insert to authenticated
with check (
  (
    user_id = (select auth.uid())
    and owner_id = (select auth.uid())
    and role = 'owner'
    and exists (select 1 from public.shared_wallets w where w.id = wallet_id and w.owner_id = (select auth.uid()))
  )
  or (
    user_id = (select auth.uid())
    and role in ('editor', 'viewer')
    and exists (
      select 1 from public.shared_wallet_invites i
      where i.wallet_id = shared_wallet_members.wallet_id
        and i.owner_id = shared_wallet_members.owner_id
        and i.invitee_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and i.role = shared_wallet_members.role
        and i.status = 'pending'
    )
  )
);

drop policy if exists "Owners update member roles" on public.shared_wallet_members;
create policy "Owners update member roles"
on public.shared_wallet_members for update to authenticated
using (owner_id = (select auth.uid()) and role <> 'owner')
with check (owner_id = (select auth.uid()) and role in ('editor', 'viewer'));

drop policy if exists "Owners remove members or members leave" on public.shared_wallet_members;
create policy "Owners remove members or members leave"
on public.shared_wallet_members for delete to authenticated
using (
  (owner_id = (select auth.uid()) and role <> 'owner')
  or (user_id = (select auth.uid()) and role <> 'owner')
);

drop policy if exists "Owners and invitees view invitations" on public.shared_wallet_invites;
create policy "Owners and invitees view invitations"
on public.shared_wallet_invites for select to authenticated
using (owner_id = (select auth.uid()) or invitee_email = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "Owners create invitations" on public.shared_wallet_invites;
create policy "Owners create invitations"
on public.shared_wallet_invites for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.shared_wallets w where w.id = wallet_id and w.owner_id = (select auth.uid()))
  and invitee_email <> lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "Owners revoke or invitees accept invitations" on public.shared_wallet_invites;
create policy "Owners revoke or invitees accept invitations"
on public.shared_wallet_invites for update to authenticated
using (owner_id = (select auth.uid()) or invitee_email = lower(coalesce((select auth.jwt() ->> 'email'), '')))
with check (
  (owner_id = (select auth.uid()) and status in ('pending', 'revoked'))
  or (
    invitee_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and status = 'accepted'
    and accepted_by = (select auth.uid())
  )
);

drop policy if exists "Wallet members view shared entries" on public.shared_wallet_entries;
create policy "Wallet members view shared entries"
on public.shared_wallet_entries for select to authenticated
using (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id and m.user_id = (select auth.uid()))
);

drop policy if exists "Editors add shared entries" on public.shared_wallet_entries;
create policy "Editors add shared entries"
on public.shared_wallet_entries for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor'))
);

drop policy if exists "Editors update shared entries" on public.shared_wallet_entries;
create policy "Editors update shared entries"
on public.shared_wallet_entries for update to authenticated
using (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor'))
)
with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor'))
);

drop policy if exists "Editors delete shared entries" on public.shared_wallet_entries;
create policy "Editors delete shared entries"
on public.shared_wallet_entries for delete to authenticated
using (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor'))
);

-- Automatically attach the owner to each new wallet. This trigger is the only
-- privileged function in the migration and is not callable as a client RPC.
create or replace function public.add_shared_wallet_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shared_wallet_members(wallet_id, user_id, owner_id, role)
  values (new.id, new.owner_id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke all on function public.add_shared_wallet_owner_membership() from public, anon, authenticated;
drop trigger if exists shared_wallet_owner_membership on public.shared_wallets;
create trigger shared_wallet_owner_membership
after insert on public.shared_wallets
for each row execute function public.add_shared_wallet_owner_membership();

grant select, insert, update, delete on public.shared_wallets to authenticated;
grant select, insert, update, delete on public.shared_wallet_members to authenticated;
grant select, insert, update on public.shared_wallet_invites to authenticated;
grant select, insert, update, delete on public.shared_wallet_entries to authenticated;
