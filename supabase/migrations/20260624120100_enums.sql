-- ============================================================================
-- T1 — Enums
-- ============================================================================

-- Source of products. TikTok Shop today; abstracted for Amazon/Shopee later
-- (the adapter pattern lives in app code — this just keeps the column typed).
create type public.affiliate_platform as enum ('tiktok_shop', 'amazon', 'shopee');

-- The single state machine (§4) spanning product -> script -> video -> publication.
-- Each entity (products / scripts / videos) sits at the stage relevant to it; the
-- full allowed-transition graph lives in packages/shared/src/state-machine.ts.
-- 'rejected' is a terminal off-ramp reachable from the human approval gates.
create type public.pipeline_status as enum (
  'product_candidate',
  'product_approved',
  'script_generating',
  'script_ready',
  'script_approved',
  'video_generating',
  'video_ready',
  'compliance_review',
  'ready_to_publish',
  'published',
  'tracking',
  'archived',
  'rejected'
);

-- HeyGen avatar quality/cost tier. III ~ US$1/min (default for format testing);
-- IV ~ US$4/min (only for already-validated formats).
create type public.avatar_tier as enum ('iii', 'iv');

-- Who caused a state transition (audit log).
create type public.pipeline_actor as enum ('system', 'user');
