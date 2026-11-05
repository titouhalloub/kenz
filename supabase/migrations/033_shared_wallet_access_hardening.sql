-- Harden immutable identity fields in shared-wallet memberships and entries.
create or replace function public.guard_shared_wallet_membership_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.wallet_id <> old.wallet_id
     or new.user_id <> old.user_id
     or new.owner_id <> old.owner_id
     or old.role = 'owner' then
    raise exception 'Shared wallet membership identity is immutable';
  end if;
  if new.role not in ('editor', 'viewer') then
    raise exception 'Invalid shared wallet role';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_shared_wallet_membership_update() from public, anon, authenticated;
drop trigger if exists guard_shared_wallet_membership_update on public.shared_wallet_members;
create trigger guard_shared_wallet_membership_update
before update on public.shared_wallet_members
for each row execute function public.guard_shared_wallet_membership_update();

drop policy if exists "Editors update shared entries" on public.shared_wallet_entries;
create policy "Editors update shared entries"
on public.shared_wallet_entries for update to authenticated
using (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid())
      and (m.role = 'owner' or (m.role = 'editor' and shared_wallet_entries.created_by = (select auth.uid()))))
)
with check (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid())
      and (m.role = 'owner' or (m.role = 'editor' and shared_wallet_entries.created_by = (select auth.uid()))))
);

drop policy if exists "Editors delete shared entries" on public.shared_wallet_entries;
create policy "Editors delete shared entries"
on public.shared_wallet_entries for delete to authenticated
using (
  exists (select 1 from public.shared_wallet_members m
    where m.wallet_id = shared_wallet_entries.wallet_id
      and m.user_id = (select auth.uid())
      and (m.role = 'owner' or (m.role = 'editor' and shared_wallet_entries.created_by = (select auth.uid()))))
);
