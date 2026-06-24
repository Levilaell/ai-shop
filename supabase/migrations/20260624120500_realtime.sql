-- ============================================================================
-- T1 — Realtime
-- ----------------------------------------------------------------------------
-- Add the tables the dashboard subscribes to (kanban board, approval queues,
-- video queue, economics) to the supabase_realtime publication. Realtime
-- authorization still honors RLS, so each client only receives changes for
-- rows in their own account.
-- ============================================================================

alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.scripts;
alter publication supabase_realtime add table public.videos;
alter publication supabase_realtime add table public.compliance_checks;
alter publication supabase_realtime add table public.publications;
alter publication supabase_realtime add table public.performance;
alter publication supabase_realtime add table public.pipeline_events;
