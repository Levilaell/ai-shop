/**
 * generate_script handler (spec §4, §7).
 *
 * Flow (all scoped to job.account_id — the worker bypasses RLS, spec §2):
 *   1. Load the product; bail if it isn't in a state that expects scripts.
 *   2. Advance product -> script_generating.
 *   3. Ask the ScriptProvider (Claude) for N distinct angles.
 *   4. Upsert one `scripts` row per angle (status script_ready).
 *   5. Advance product -> script_ready (lands it in the approval queue, §10.3).
 *
 * Idempotency (spec §4): re-running must not duplicate scripts. The unique
 * (product_id, variant_index) constraint plus an "already advanced?" guard make
 * reprocessing safe — a retry after a partial failure regenerates cleanly.
 */

import {
  DEFAULT_SCRIPT_VARIANTS,
  isAtOrBeyond,
  type GenerateScriptJob,
} from '@ai-shop/shared';
import type { HandlerContext } from './context.js';

export async function handleGenerateScript(
  job: GenerateScriptJob,
  ctx: HandlerContext,
): Promise<void> {
  const { db, log } = ctx;

  if (!ctx.scriptProvider) {
    throw new Error('ANTHROPIC_API_KEY ausente: scriptProvider não configurado (T4)');
  }

  const { data: product, error } = await db
    .from('products')
    .select('id, account_id, title, category, price_brl, affiliate_platform, status')
    .eq('id', job.product_id)
    .eq('account_id', job.account_id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar produto: ${error.message}`);
  if (!product) {
    // Product gone (deleted) — nothing to do; ack so we don't retry forever.
    log.warn('produto não encontrado; ignorando job', { product_id: job.product_id });
    return;
  }

  // Idempotency guard: if the product already reached script_ready (or beyond),
  // a previous run finished — don't regenerate.
  if (isAtOrBeyond(product.status, 'script_ready')) {
    log.info('produto já em script_ready ou além; pulando', { status: product.status });
    return;
  }

  const variants = job.variants ?? DEFAULT_SCRIPT_VARIANTS;

  // Mark generation in progress (audit trail via trigger).
  const { error: updErr } = await db
    .from('products')
    .update({ status: 'script_generating' })
    .eq('id', product.id)
    .eq('account_id', job.account_id);
  if (updErr) throw new Error(`Falha ao marcar script_generating: ${updErr.message}`);

  log.info('gerando roteiros', { variants, model: ctx.scriptProvider.model });
  const angles = await ctx.scriptProvider.generate({
    product: {
      title: product.title,
      category: product.category,
      price_brl: Number(product.price_brl),
      affiliate_platform: product.affiliate_platform,
    },
    variants,
  });

  // Upsert each angle. onConflict on the unique (product_id, variant_index)
  // makes a retry idempotent: same slot, refreshed content, no duplicate rows.
  const rows = angles.map((a, i) => ({
    product_id: product.id,
    account_id: job.account_id,
    angle: a.angle,
    hook: a.hook,
    body: a.body,
    cta: a.cta,
    variant_index: i,
    status: 'script_ready' as const,
    model_used: ctx.scriptProvider!.model,
  }));

  const { error: insErr } = await db
    .from('scripts')
    .upsert(rows, { onConflict: 'product_id,variant_index' });
  if (insErr) throw new Error(`Falha ao inserir roteiros: ${insErr.message}`);

  const { error: readyErr } = await db
    .from('products')
    .update({ status: 'script_ready' })
    .eq('id', product.id)
    .eq('account_id', job.account_id);
  if (readyErr) throw new Error(`Falha ao marcar script_ready: ${readyErr.message}`);

  log.info('roteiros prontos', { count: rows.length });
}
