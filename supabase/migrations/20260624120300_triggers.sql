-- ============================================================================
-- T1 — Triggers: updated_at maintenance + pipeline_events audit
-- ============================================================================

-- updated_at -----------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.accounts
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.scripts
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.videos
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.compliance_checks
  for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.publications
  for each row execute function public.tg_set_updated_at();

-- pipeline_events audit ------------------------------------------------------
-- Records every status change on a pipeline entity. Idempotent: the UPDATE
-- trigger fires only when status actually changes (WHEN clause below), so
-- reprocessing a row without moving its status never logs a duplicate. The
-- INSERT trigger captures the entity's initial state.
--
-- actor is derived from the auth context: a request carrying a JWT (frontend
-- user) has auth.uid() set -> 'user'; the worker using the service_role key has
-- auth.uid() null -> 'system'. SECURITY DEFINER lets the audit insert bypass
-- pipeline_events' RLS so logging can never be blocked by a caller's policy.
create or replace function public.tg_log_pipeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  insert into public.pipeline_events (
    account_id, entity_type, entity_id, from_status, to_status, actor, actor_user_id
  ) values (
    new.account_id,
    tg_table_name,
    new.id,
    case when tg_op = 'UPDATE' then old.status else null end,
    new.status,
    case when v_uid is null then 'system'::public.pipeline_actor
         else 'user'::public.pipeline_actor end,
    v_uid
  );
  return new;
end;
$$;

-- products
create trigger log_pipeline_event_ins after insert on public.products
  for each row execute function public.tg_log_pipeline_event();
create trigger log_pipeline_event_upd after update on public.products
  for each row when (old.status is distinct from new.status)
  execute function public.tg_log_pipeline_event();

-- scripts
create trigger log_pipeline_event_ins after insert on public.scripts
  for each row execute function public.tg_log_pipeline_event();
create trigger log_pipeline_event_upd after update on public.scripts
  for each row when (old.status is distinct from new.status)
  execute function public.tg_log_pipeline_event();

-- videos
create trigger log_pipeline_event_ins after insert on public.videos
  for each row execute function public.tg_log_pipeline_event();
create trigger log_pipeline_event_upd after update on public.videos
  for each row when (old.status is distinct from new.status)
  execute function public.tg_log_pipeline_event();
