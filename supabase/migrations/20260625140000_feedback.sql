-- ============================================================================
-- T8 — Performance feedback enqueue
-- ----------------------------------------------------------------------------
-- When a performance row is recorded (manual entry in v1, spec §13), enqueue a
-- collect_performance job so the worker folds the realized outcome back into the
-- product's score (the feedback loop, spec §12 T8).
-- ============================================================================

create or replace function public.tg_enqueue_collect_performance()
returns trigger
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  perform pgmq.send('ai_shop_jobs', jsonb_build_object(
    'type', 'collect_performance',
    'account_id', new.account_id,
    'publication_id', new.publication_id
  ));
  return new;
end;
$$;

create trigger enqueue_collect_performance after insert on public.performance
  for each row execute function public.tg_enqueue_collect_performance();
