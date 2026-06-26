/**
 * generate_video handler (spec §4, §5, §8). Submits an approved script to HeyGen.
 *
 * Gating: the runner holds a HeyGen-concurrency permit around this handler
 * (spec §5, max 10). Cost is recorded at submission (cost_usd_estimated, NOT
 * NULL — spec §3).
 *
 * Idempotency (spec §4): one video row per script. If a video already has a
 * heygen_job_id we do NOT resubmit (that would double-charge) — we just ensure a
 * poll is scheduled. A failed job clears heygen_job_id so a retry re-submits.
 */

import { heygenCostUsd, isAtOrBeyond, type AvatarTier, type GenerateVideoJob } from '@ai-shop/shared';
import type { HandlerContext } from './context.js';

export async function handleGenerateVideo(
  job: GenerateVideoJob,
  ctx: HandlerContext,
): Promise<void> {
  const { db, log, config } = ctx;

  if (!ctx.videoProvider) {
    throw new Error('HeyGen não configurado (HEYGEN_API_KEY/AVATAR_ID/VOICE_ID) — T5');
  }

  // Load the approved script (scoped to account — worker bypasses RLS, §2).
  const { data: script, error: scriptErr } = await db
    .from('scripts')
    .select('id, account_id, product_id, hook, body, cta, status')
    .eq('id', job.script_id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (scriptErr) throw new Error(`Falha ao carregar roteiro: ${scriptErr.message}`);
  if (!script) {
    log.warn('roteiro não encontrado; ignorando job', { script_id: job.script_id });
    return;
  }

  const avatarTier: AvatarTier = job.avatar_tier ?? 'iii';

  // Existing video for this script?
  const { data: existing, error: existErr } = await db
    .from('videos')
    .select('id, status, heygen_job_id')
    .eq('script_id', script.id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (existErr) throw new Error(`Falha ao consultar vídeo existente: ${existErr.message}`);

  if (existing) {
    if (isAtOrBeyond(existing.status, 'video_ready')) {
      log.info('vídeo já pronto ou além; pulando', { video_id: existing.id });
      return;
    }
    if (existing.heygen_job_id) {
      // Already submitted — don't resubmit (idempotency/cost). Ensure a poll runs.
      log.info('vídeo já submetido; reagendando poll', { video_id: existing.id });
      await ctx.queue.send(
        { type: 'poll_video', account_id: job.account_id, video_id: existing.id },
        config.videoPollDelaySeconds,
      );
      return;
    }
  }

  const costEstimated = heygenCostUsd(config.estimatedVideoDurationSeconds, avatarTier);

  // Create/ensure the video row BEFORE submitting, so a crash mid-submit leaves a
  // record. cost_usd_estimated is set now (first-class cost, §3).
  let videoId = existing?.id;
  if (!videoId) {
    const { data: created, error: insErr } = await db
      .from('videos')
      .insert({
        script_id: script.id,
        product_id: script.product_id,
        account_id: job.account_id,
        avatar_tier: avatarTier,
        cost_usd_estimated: costEstimated,
        status: 'video_generating',
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`Falha ao criar vídeo: ${insErr.message}`);
    videoId = created.id;
  }

  // Advance the product so the board reflects the stage.
  await db
    .from('products')
    .update({ status: 'video_generating' })
    .eq('id', script.product_id)
    .eq('account_id', job.account_id);

  // Submit to HeyGen (this is the section bounded by the concurrency permit).
  try {
    log.info('submetendo vídeo ao HeyGen', { video_id: videoId, avatarTier });
    const result = await ctx.videoProvider.submit({
      script: { hook: script.hook, body: script.body, cta: script.cta },
      avatarTier,
      estimatedDurationSeconds: config.estimatedVideoDurationSeconds,
    });

    const { error: updErr } = await db
      .from('videos')
      .update({
        heygen_job_id: result.jobId,
        cost_usd_estimated: result.costUsdEstimated,
        error: null,
        status: 'video_generating',
      })
      .eq('id', videoId)
      .eq('account_id', job.account_id);
    if (updErr) throw new Error(`Falha ao gravar heygen_job_id: ${updErr.message}`);

    // Schedule the first poll.
    await ctx.queue.send(
      { type: 'poll_video', account_id: job.account_id, video_id: videoId },
      config.videoPollDelaySeconds,
    );
    log.info('vídeo submetido', { video_id: videoId, heygen_job_id: result.jobId });
  } catch (err) {
    // Spec §4: a HeyGen failure keeps status video_generating with error set and
    // retry_count incremented; the job retries via the queue's visibility timeout.
    const { data: cur } = await db
      .from('videos')
      .select('retry_count')
      .eq('id', videoId)
      .eq('account_id', job.account_id)
      .maybeSingle();
    await db
      .from('videos')
      .update({
        error: (err as Error).message,
        retry_count: (cur?.retry_count ?? 0) + 1,
        status: 'video_generating',
      })
      .eq('id', videoId)
      .eq('account_id', job.account_id);
    throw err; // let the runner apply retry/backoff
  }
}
