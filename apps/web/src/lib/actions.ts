'use server';

import { revalidatePath } from 'next/cache';
import { parseProductsCsv, buildProductInsert } from '@ai-shop/shared';
import type { Json } from '@ai-shop/db';
import { createClient } from '@/lib/supabase/server';

/**
 * State-machine transitions, driven by the operator (HITL gates, spec §4/§10).
 * All run as the signed-in user, so RLS scopes every write to their account —
 * we never pass account_id from the client. DB triggers handle audit logging,
 * job enqueue, and the compliance hard block.
 */

function refreshAll(): void {
  revalidatePath('/board');
  revalidatePath('/products');
  revalidatePath('/scripts');
  revalidatePath('/videos');
  revalidatePath('/compliance');
  revalidatePath('/economics');
}

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  return user.id;
}

export interface IngestResult {
  inserted: number;
  rowErrors: string[];
  error?: string;
}

/**
 * Manual product ingestion (spec §2/T2): paste a TikTok Shop catalog CSV, score
 * each row, and insert as candidates. Dedupes on (account, platform,
 * external_ref). Invalid rows are reported but don't block the valid ones.
 */
export async function ingestProducts(csv: string): Promise<IngestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { inserted: 0, rowErrors: [], error: 'Não autenticado' };

  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return { inserted: 0, rowErrors: [], error: 'Usuário sem conta' };

  const { rows, errors } = parseProductsCsv(csv);
  const rowErrors = errors.map((e) => `linha ${e.row}: ${e.message}`);
  if (rows.length === 0) return { inserted: 0, rowErrors, error: rowErrors[0] ?? 'Nenhuma linha válida' };

  const inserts = rows.map((r) => {
    const ins = buildProductInsert(r, membership.account_id);
    return { ...ins, score_breakdown: ins.score_breakdown as unknown as Json };
  });

  const { error } = await supabase
    .from('products')
    .upsert(inserts, { onConflict: 'account_id,affiliate_platform,external_ref', ignoreDuplicates: true });
  if (error) return { inserted: 0, rowErrors, error: error.message };

  refreshAll();
  return { inserted: inserts.length, rowErrors };
}

/** Product approval (product_candidate -> product_approved). Enqueues scripts. */
export async function approveProduct(productId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('products')
    .update({ status: 'product_approved' })
    .eq('id', productId);
  if (error) throw new Error(error.message);
  refreshAll();
}

/** Reject a product candidate (terminal off-ramp). */
export async function rejectProduct(productId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('products').update({ status: 'rejected' }).eq('id', productId);
  if (error) throw new Error(error.message);
  refreshAll();
}

/**
 * Approve ONE script angle. The chosen script -> script_approved (enqueues the
 * expensive HeyGen job via trigger); sibling angles -> rejected; product
 * advances to script_approved.
 */
export async function approveScript(scriptId: string): Promise<void> {
  const supabase = await createClient();
  const { data: script, error: loadErr } = await supabase
    .from('scripts')
    .select('id, product_id')
    .eq('id', scriptId)
    .single();
  if (loadErr) throw new Error(loadErr.message);

  const { error: rejErr } = await supabase
    .from('scripts')
    .update({ status: 'rejected' })
    .eq('product_id', script.product_id)
    .eq('status', 'script_ready')
    .neq('id', scriptId);
  if (rejErr) throw new Error(rejErr.message);

  const { error: appErr } = await supabase
    .from('scripts')
    .update({ status: 'script_approved' })
    .eq('id', scriptId);
  if (appErr) throw new Error(appErr.message);

  const { error: prodErr } = await supabase
    .from('products')
    .update({ status: 'script_approved' })
    .eq('id', script.product_id);
  if (prodErr) throw new Error(prodErr.message);

  refreshAll();
}

/** Submit/Update the compliance checklist for a video (records the review). */
export async function submitCompliance(
  videoId: string,
  claimsOk: boolean,
  notes: string,
): Promise<void> {
  const supabase = await createClient();
  const userId = await currentUserId();
  const { error } = await supabase
    .from('compliance_checks')
    .update({
      claims_ok: claimsOk,
      notes: notes || null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('video_id', videoId);
  if (error) throw new Error(error.message);
  refreshAll();
}

/**
 * Release a video for publication (compliance_review -> ready_to_publish). The
 * DB trigger enforces the compliance gate (§9) — this throws if the checklist
 * is incomplete.
 */
export async function approveCompliance(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('products')
    .update({ status: 'ready_to_publish' })
    .eq('id', productId);
  if (error) return { error: error.message };
  refreshAll();
  return {};
}

export interface PerformanceInput {
  views: number;
  clicks: number;
  orders: number;
  gmvBrl: number;
  commissionBrl: number;
}

/**
 * Manual performance entry (spec §13 T8). Inserts a performance row for a
 * publication; a DB trigger enqueues collect_performance so the worker folds the
 * realized outcome back into the product score (feedback loop).
 */
export async function addPerformance(
  publicationId: string,
  input: PerformanceInput,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // account_id required (NOT NULL + composite FK) — derive from the publication.
  const { data: pub, error: pErr } = await supabase
    .from('publications')
    .select('account_id')
    .eq('id', publicationId)
    .single();
  if (pErr) return { error: pErr.message };

  const { error } = await supabase.from('performance').insert({
    publication_id: publicationId,
    account_id: pub.account_id,
    views: input.views,
    clicks: input.clicks,
    orders: input.orders,
    gmv_brl: input.gmvBrl,
    commission_brl: input.commissionBrl,
  });
  if (error) return { error: error.message };
  refreshAll();
  return {};
}

/**
 * Record a manual publication (ready_to_publish -> published). Creates the
 * publications row with the pasted TikTok URL and advances the product.
 */
export async function publish(
  videoId: string,
  productId: string,
  tiktokPostUrl: string,
  affiliateLinkUsed: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Derive account_id from the video (RLS guarantees it's ours) — required by
  // the composite FK (video_id, account_id) -> videos(id, account_id).
  const { data: video, error: vErr } = await supabase
    .from('videos')
    .select('account_id')
    .eq('id', videoId)
    .single();
  if (vErr) return { error: vErr.message };

  const { error: pubErr } = await supabase.from('publications').insert({
    video_id: videoId,
    account_id: video.account_id,
    tiktok_post_url: tiktokPostUrl || null,
    affiliate_link_used: affiliateLinkUsed || null,
    published_at: new Date().toISOString(),
  });
  if (pubErr) return { error: pubErr.message };

  const { error: prodErr } = await supabase
    .from('products')
    .update({ status: 'published' })
    .eq('id', productId);
  if (prodErr) return { error: prodErr.message };

  refreshAll();
  return {};
}
