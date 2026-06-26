/**
 * One-off smoke helper: insert a properly-scored test product via the real T2
 * scorer, then approve it (which fires the enqueue trigger -> generate_script).
 * Run: pnpm --filter @ai-shop/worker exec tsx scripts/seed-test-product.ts
 */
import { createServiceClient, type Json } from '@ai-shop/db';
import { buildProductInsert, type ProductImportRow } from '@ai-shop/shared';

// Load root .env the same way the worker does.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
let dir = process.cwd();
for (let i = 0; i < 8; i++) {
  const c = join(dir, '.env');
  if (existsSync(c)) {
    process.loadEnvFile?.(c);
    break;
  }
  const p = dirname(dir);
  if (p === dir) break;
  dir = p;
}

const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

const row: ProductImportRow = {
  external_ref: 'TT-TEST-' + Math.floor(Date.now() / 1000),
  title: 'Mini aspirador de teclado recarregável USB-C',
  price_brl: 69.9,
  commission_pct: 22,
  category: 'tech_acessorios',
  affiliate_link: 'https://shop.tiktok.com/aff/TT-TEST',
  affiliate_platform: 'tiktok_shop',
};

async function main() {
  const db = createServiceClient();
  const insert = buildProductInsert(row, ACCOUNT_ID);
  console.log(`[seed] score calculado = ${insert.score} (blocked=${insert.score_breakdown.blocked})`);

  const { data, error } = await db
    .from('products')
    .insert({ ...insert, score_breakdown: insert.score_breakdown as unknown as Json })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  console.log(`[seed] produto inserido: ${data.id}`);

  const { error: upd } = await db
    .from('products')
    .update({ status: 'product_approved' })
    .eq('id', data.id)
    .eq('account_id', ACCOUNT_ID);
  if (upd) throw new Error(upd.message);
  console.log('[seed] aprovado -> enqueue generate_script disparado. O worker vai gerar os roteiros.');
  console.log(`[seed] PRODUCT_ID=${data.id}`);
}

void main().catch((e) => {
  console.error('[seed] erro:', e.message);
  process.exit(1);
});
