-- ============================================================================
-- T3 — pgmq job queue + enqueue triggers
-- ----------------------------------------------------------------------------
-- The worker (service_role) drives pgmq through SECURITY DEFINER wrappers in the
-- public schema, exposed over PostgREST RPC. The wrappers are locked down to the
-- service_role: the browser/authenticated client must NOT be able to read, send,
-- or delete jobs. State transitions that kick off async work enqueue jobs via
-- AFTER UPDATE triggers, so the frontend only ever flips a status and the worker
-- picks the job up — enqueue is atomic with the status change.
-- ============================================================================

-- Single work queue for all job types (payload carries the discriminator).
select pgmq.create('ai_shop_jobs');

-- --- RPC wrappers ----------------------------------------------------------
-- SECURITY DEFINER so they run as the (postgres) owner and can touch the pgmq
-- schema; search_path pinned to avoid hijacking.

create or replace function public.queue_send(p_queue text, p_msg jsonb, p_delay integer default 0)
returns bigint
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.send(p_queue, p_msg, p_delay);
$$;

create or replace function public.queue_read(p_queue text, p_vt integer, p_qty integer)
returns setof pgmq.message_record
language sql
security definer
set search_path = pgmq, public
as $$
  select * from pgmq.read(p_queue, p_vt, p_qty);
$$;

create or replace function public.queue_delete(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.delete(p_queue, p_msg_id);
$$;

create or replace function public.queue_archive(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.archive(p_queue, p_msg_id);
$$;

-- Lock the wrappers to the worker only (service_role bypasses RLS but still
-- needs EXECUTE). Authenticated users have no business touching the queue.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.queue_send(text,jsonb,integer)',
    'public.queue_read(text,integer,integer)',
    'public.queue_delete(text,bigint)',
    'public.queue_archive(text,bigint)'
  ] loop
    execute format('revoke all on function %s from public, authenticated, anon', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end$$;

-- --- Enqueue triggers ------------------------------------------------------
-- A status change that begins async work drops a job on the queue. Idempotent at
-- the trigger level (fires only on a real status change to the target value).

create or replace function public.tg_enqueue_pipeline_job()
returns trigger
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  if tg_table_name = 'products' and new.status = 'product_approved' then
    perform pgmq.send('ai_shop_jobs', jsonb_build_object(
      'type', 'generate_script',
      'account_id', new.account_id,
      'product_id', new.id
    ));
  elsif tg_table_name = 'scripts' and new.status = 'script_approved' then
    -- Gates the expensive HeyGen call: only an approved script enqueues a video.
    perform pgmq.send('ai_shop_jobs', jsonb_build_object(
      'type', 'generate_video',
      'account_id', new.account_id,
      'product_id', new.product_id,
      'script_id', new.id
    ));
  end if;
  return new;
end;
$$;

create trigger enqueue_generate_script after update on public.products
  for each row
  when (old.status is distinct from new.status and new.status = 'product_approved')
  execute function public.tg_enqueue_pipeline_job();

create trigger enqueue_generate_video after update on public.scripts
  for each row
  when (old.status is distinct from new.status and new.status = 'script_approved')
  execute function public.tg_enqueue_pipeline_job();
