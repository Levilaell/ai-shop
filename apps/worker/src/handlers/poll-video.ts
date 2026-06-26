/**
 * poll_video handler (spec §4, §5). Checks a submitted HeyGen job:
 *  - pending   -> re-enqueue poll_video with a delay (back to the queue).
 *  - completed -> record cost_usd_actual + duration + video_url, advance to
 *                 video_ready, create the compliance_checks row, and move the
 *                 product into compliance_review (the mandatory gate, §9).
 *  - failed    -> increment retry_count; if under the cap, clear heygen_job_id
 *                 and re-enqueue generate_video (re-submit, NOT regenerate the
 *                 script — spec §4) with backoff; else leave it failed.
 */

import { heygenCostUsd, isAtOrBeyond, type AvatarTier, type PollVideoJob } from '@ai-shop/shared';
import type { HandlerContext } from './context.js';

export async function handlePollVideo(job: PollVideoJob, ctx: HandlerContext): Promise<void> {
  const { db, log, config } = ctx;

  if (!ctx.videoProvider) {
    throw new Error('HeyGen não configurado — T5');
  }

  const { data: video, error } = await db
    .from('videos')
    .select('id, account_id, product_id, script_id, status, heygen_job_id, avatar_tier, retry_count')
    .eq('id', job.video_id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar vídeo: ${error.message}`);
  if (!video) {
    log.warn('vídeo não encontrado; ignorando poll', { video_id: job.video_id });
    return;
  }
  if (isAtOrBeyond(video.status, 'video_ready')) {
    log.info('vídeo já pronto ou além; ignorando poll', { status: video.status });
    return;
  }
  if (!video.heygen_job_id) {
    log.warn('vídeo sem heygen_job_id; nada para pollar', { video_id: video.id });
    return;
  }

  const result = await ctx.videoProvider.poll(video.heygen_job_id);

  if (result.status === 'pending') {
    log.info('vídeo ainda processando; reagendando', { video_id: video.id });
    await ctx.queue.send(
      { type: 'poll_video', account_id: job.account_id, video_id: video.id },
      config.videoPollDelaySeconds,
    );
    return;
  }

  if (result.status === 'failed') {
    const retryCount = video.retry_count + 1;
    const canRetry = retryCount <= config.maxVideoRetries;
    await db
      .from('videos')
      .update({
        error: result.error ?? 'HeyGen job failed',
        retry_count: retryCount,
        // clear the job id so generate_video re-submits a fresh job
        heygen_job_id: null,
        status: 'video_generating',
      })
      .eq('id', video.id)
      .eq('account_id', job.account_id);

    if (canRetry) {
      // Backoff grows with the attempt count.
      const delay = config.videoPollDelaySeconds * retryCount;
      log.warn('job HeyGen falhou; reenfileirando generate_video', { retryCount, delay });
      await ctx.queue.send(
        {
          type: 'generate_video',
          account_id: job.account_id,
          product_id: video.product_id,
          script_id: video.script_id,
          avatar_tier: video.avatar_tier,
        },
        delay,
      );
    } else {
      log.error('job HeyGen falhou e excedeu retries; desistindo', { retryCount });
    }
    return;
  }

  // completed
  const tier: AvatarTier = video.avatar_tier;
  const duration = result.durationSeconds ?? 0;
  const costActual = heygenCostUsd(duration, tier);

  const { error: updErr } = await db
    .from('videos')
    .update({
      status: 'video_ready',
      video_url: result.videoUrl ?? null,
      duration_seconds: duration,
      cost_usd_actual: costActual,
      error: null,
    })
    .eq('id', video.id)
    .eq('account_id', job.account_id);
  if (updErr) throw new Error(`Falha ao marcar video_ready: ${updErr.message}`);

  // Create the compliance checklist row (idempotent: one per video) and move the
  // product into the mandatory compliance gate (§9). ai_label_required defaults
  // to true in the schema (always true for HeyGen video).
  const { error: ccErr } = await db
    .from('compliance_checks')
    .upsert(
      { video_id: video.id, account_id: job.account_id },
      { onConflict: 'video_id', ignoreDuplicates: true },
    );
  if (ccErr) throw new Error(`Falha ao criar compliance_check: ${ccErr.message}`);

  await db
    .from('products')
    .update({ status: 'compliance_review' })
    .eq('id', video.product_id)
    .eq('account_id', job.account_id);

  log.info('vídeo pronto; em compliance_review', {
    video_id: video.id,
    duration,
    costActual,
  });
}
