/**
 * collect_performance handler (spec §8 T8 — the feedback loop).
 *
 * Sums the publication's performance, converts the video's USD production cost
 * to BRL, blends the product's predicted score with the realized outcome
 * (blendScore), persists the adjusted score, and moves the product into
 * `tracking`. v1 performance is entered manually (spec §13); this job is
 * triggered by the performance INSERT (see *_feedback.sql).
 */

import { blendScore, DEFAULT_SCORE_CONFIG, type CollectPerformanceJob } from '@ai-shop/shared';
import type { HandlerContext } from './context.js';

export async function handleCollectPerformance(
  job: CollectPerformanceJob,
  ctx: HandlerContext,
): Promise<void> {
  const { db, log } = ctx;

  // publication -> video -> product chain (scoped to account, §2).
  const { data: pub, error: pubErr } = await db
    .from('publications')
    .select('id, account_id, video_id')
    .eq('id', job.publication_id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (pubErr) throw new Error(`Falha ao carregar publicação: ${pubErr.message}`);
  if (!pub) {
    log.warn('publicação não encontrada; ignorando', { publication_id: job.publication_id });
    return;
  }

  const { data: video, error: vErr } = await db
    .from('videos')
    .select('product_id, cost_usd_actual, cost_usd_estimated')
    .eq('id', pub.video_id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (vErr) throw new Error(`Falha ao carregar vídeo: ${vErr.message}`);
  if (!video) {
    log.warn('vídeo da publicação não encontrado; ignorando', { video_id: pub.video_id });
    return;
  }

  // Aggregate all performance rows for the publication.
  const { data: perfs, error: perfErr } = await db
    .from('performance')
    .select('views, clicks, orders, commission_brl, gmv_brl')
    .eq('publication_id', pub.id)
    .eq('account_id', job.account_id);
  if (perfErr) throw new Error(`Falha ao carregar performance: ${perfErr.message}`);

  const totals = (perfs ?? []).reduce(
    (t, p) => ({
      views: t.views + Number(p.views ?? 0),
      clicks: t.clicks + Number(p.clicks ?? 0),
      orders: t.orders + Number(p.orders ?? 0),
      commissionBrl: t.commissionBrl + Number(p.commission_brl ?? 0),
    }),
    { views: 0, clicks: 0, orders: 0, commissionBrl: 0 },
  );

  const costUsd = Number(video.cost_usd_actual ?? video.cost_usd_estimated ?? 0);
  const productionCostBrl = costUsd * DEFAULT_SCORE_CONFIG.economics.usdToBrl;

  const { data: product, error: prodErr } = await db
    .from('products')
    .select('id, score, status')
    .eq('id', video.product_id)
    .eq('account_id', job.account_id)
    .maybeSingle();
  if (prodErr) throw new Error(`Falha ao carregar produto: ${prodErr.message}`);
  if (!product) {
    log.warn('produto não encontrado; ignorando', { product_id: video.product_id });
    return;
  }

  const predicted = product.score != null ? Number(product.score) : 0;
  const blended = blendScore(predicted, { ...totals, productionCostBrl });

  // Persist the realized score. Advance published -> tracking (system, §4); if
  // the product is already at/beyond tracking we only refresh the score.
  const update: { score: number; status?: 'tracking' } = { score: blended };
  if (product.status === 'published') update.status = 'tracking';

  const { error: updErr } = await db
    .from('products')
    .update(update)
    .eq('id', product.id)
    .eq('account_id', job.account_id);
  if (updErr) throw new Error(`Falha ao atualizar score/tracking: ${updErr.message}`);

  log.info('feedback aplicado', {
    product_id: product.id,
    predicted,
    blended,
    orders: totals.orders,
    commissionBrl: totals.commissionBrl,
    productionCostBrl,
  });
}
