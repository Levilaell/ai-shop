-- ============================================================================
-- T6 — Compliance gate enforcement (spec §9)
-- ----------------------------------------------------------------------------
-- Hard block, enforced in the database so no client can skip it: a product may
-- only enter 'ready_to_publish' when the compliance checklist for its video is
-- complete (claims_ok = true AND the review is recorded). Mirrors the pure
-- evaluateComplianceGate() in packages/shared/src/compliance.ts.
-- ============================================================================

create or replace function public.tg_enforce_compliance_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  -- Only police the transition INTO ready_to_publish.
  if new.status = 'ready_to_publish' and new.status is distinct from old.status then
    select (cc.claims_ok is true
            and cc.reviewed_at is not null
            and cc.reviewed_by is not null)
      into v_ok
      from public.videos v
      join public.compliance_checks cc
        on cc.video_id = v.id and cc.account_id = v.account_id
      where v.product_id = new.id
        and v.account_id = new.account_id
      order by v.created_at desc
      limit 1;

    if v_ok is distinct from true then
      raise exception
        'Compliance gate: checklist incompleto (claims_ok + revisao obrigatorios) antes de ready_to_publish'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_compliance_gate before update on public.products
  for each row
  when (new.status = 'ready_to_publish')
  execute function public.tg_enforce_compliance_gate();
