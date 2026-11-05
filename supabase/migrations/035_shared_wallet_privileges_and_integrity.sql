-- Keep shared-wallet data inaccessible to anonymous clients even if legacy
-- default grants exist on the project.
revoke all on public.shared_wallets, public.shared_wallet_members,
  public.shared_wallet_invites, public.shared_wallet_entries from anon, public;

grant select, insert, update, delete on public.shared_wallets to authenticated;
grant select, insert, update, delete on public.shared_wallet_members to authenticated;
grant select, insert, update on public.shared_wallet_invites to authenticated;
grant select, insert, update, delete on public.shared_wallet_entries to authenticated;

create or replace function public.guard_shared_wallet_entry_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_currency text;
begin
  if tg_op = 'UPDATE' and (
    new.wallet_id <> old.wallet_id
    or new.created_by <> old.created_by
    or new.currency <> old.currency
  ) then
    raise exception 'Shared wallet entry identity is immutable';
  end if;

  select w.currency into expected_currency
  from public.shared_wallets w
  where w.id = new.wallet_id;

  if expected_currency is null or new.currency <> expected_currency then
    raise exception 'Entry currency must match the shared wallet currency';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_shared_wallet_entry_integrity() from public, anon, authenticated;
drop trigger if exists guard_shared_wallet_entry_integrity on public.shared_wallet_entries;
create trigger guard_shared_wallet_entry_integrity
before insert or update on public.shared_wallet_entries
for each row execute function public.guard_shared_wallet_entry_integrity();
