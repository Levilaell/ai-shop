-- ============================================================================
-- T1 — Extensions
-- ----------------------------------------------------------------------------
-- pgmq      : in-Postgres message queue. Backbone of the worker job queue (T3+).
--             Only the extension is enabled here; queues are created in T3.
-- pgcrypto  : crypt()/gen_salt() used by the LOCAL seed to create a test auth
--             user. Supabase installs it into the `extensions` schema.
-- ============================================================================

create extension if not exists pgmq;
create extension if not exists pgcrypto with schema extensions;
