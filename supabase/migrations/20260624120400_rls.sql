-- ============================================================================
-- T1 — Row Level Security (membership model)
-- ----------------------------------------------------------------------------
-- Isolation is by account membership: a row is visible/writable to the
-- authenticated user iff they have a row in account_users for that account_id.
-- The worker uses the service_role key, which BYPASSES RLS entirely — it must
-- filter account_id explicitly in every query (spec §2).
-- ============================================================================

-- Membership helper. SECURITY DEFINER so it reads account_users WITHOUT
-- re-triggering account_users' own RLS (which would otherwise recurse).
create or replace function public.is_account_member(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_users au
    where au.account_id = p_account_id
      and au.user_id = auth.uid()
  );
$$;
revoke all on function public.is_account_member(uuid) from public;
grant execute on function public.is_account_member(uuid) to authenticated;

-- Enable RLS everywhere.
alter table public.accounts          enable row level security;
alter table public.account_users     enable row level security;
alter table public.products          enable row level security;
alter table public.scripts           enable row level security;
alter table public.videos            enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.publications      enable row level security;
alter table public.performance       enable row level security;
alter table public.pipeline_events   enable row level security;

-- Base grants (RLS narrows what these can actually touch).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- The worker uses the service_role key, which BYPASSES RLS — but bypassing RLS
-- does NOT grant table privileges, so service_role still needs explicit grants
-- (spec §2: the worker reads/writes every domain table directly).
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- accounts: members can read/update their own account. Creation is done by the
-- seed / service_role (no public signup flow in v1, see spec §13).
create policy accounts_select on public.accounts
  for select to authenticated using (public.is_account_member(id));
create policy accounts_update on public.accounts
  for update to authenticated
  using (public.is_account_member(id))
  with check (public.is_account_member(id));

-- account_users is the ROOT of the RLS model, so clients must NOT be able to
-- forge or delete memberships — otherwise a member could mint an 'owner' row for
-- an arbitrary user (granting access) or delete other members. Memberships are
-- written only by the seed (superuser) and the worker (service_role), both of
-- which bypass RLS; v1 has no in-app membership management. So: revoke client
-- writes and expose read-only access (own memberships + accounts you belong to).
revoke insert, update, delete on public.account_users from authenticated;
create policy account_users_select on public.account_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_account_member(account_id));

-- Domain tables: full access scoped to account membership.
create policy products_tenant on public.products
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy scripts_tenant on public.scripts
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy videos_tenant on public.videos
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy compliance_checks_tenant on public.compliance_checks
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy publications_tenant on public.publications
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

create policy performance_tenant on public.performance
  for all to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

-- pipeline_events is an append-only audit log: users may READ their account's
-- events, but only the SECURITY DEFINER trigger writes. Revoke write grants so
-- there is no path for a client to forge audit rows.
revoke insert, update, delete on public.pipeline_events from authenticated;
create policy pipeline_events_select on public.pipeline_events
  for select to authenticated using (public.is_account_member(account_id));
