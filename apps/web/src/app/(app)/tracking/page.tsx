import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';
import { PerformanceForm } from '@/components/PerformanceForm';

export const dynamic = 'force-dynamic';

export default async function TrackingPage() {
  const supabase = await createClient();

  const [{ data: publications }, { data: videos }, { data: products }, { data: performance }] =
    await Promise.all([
      supabase
        .from('publications')
        .select('id, video_id, tiktok_post_url, published_at')
        .order('published_at', { ascending: false }),
      supabase.from('videos').select('id, product_id'),
      supabase.from('products').select('id, title, score'),
      supabase.from('performance').select('publication_id, views, clicks, orders, commission_brl'),
    ]);

  const productByVideo = new Map((videos ?? []).map((v) => [v.id, v.product_id]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const perfByPub = new Map<string, { views: number; clicks: number; orders: number; commission: number }>();
  for (const p of performance ?? []) {
    const cur = perfByPub.get(p.publication_id) ?? { views: 0, clicks: 0, orders: 0, commission: 0 };
    cur.views += Number(p.views ?? 0);
    cur.clicks += Number(p.clicks ?? 0);
    cur.orders += Number(p.orders ?? 0);
    cur.commission += Number(p.commission_brl ?? 0);
    perfByPub.set(p.publication_id, cur);
  }

  return (
    <>
      <Realtime tables={['publications', 'performance', 'products']} />
      <h2>Tracking & feedback</h2>
      <p className="muted">
        Entre com a performance real de cada publicação. Cada registro realimenta o score do produto.
      </p>
      {(publications ?? []).length === 0 && <p className="muted">Nenhuma publicação ainda.</p>}
      {(publications ?? []).map((pub) => {
        const productId = productByVideo.get(pub.video_id);
        const product = productId ? productById.get(productId) : undefined;
        const totals = perfByPub.get(pub.id);
        return (
          <div className="card" key={pub.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{product?.title ?? 'Produto'}</strong>
              <span className="tag">
                score {product?.score != null ? Number(product.score).toFixed(1) : '—'}
              </span>
            </div>
            {pub.tiktok_post_url && (
              <a href={pub.tiktok_post_url} target="_blank" rel="noreferrer">
                {pub.tiktok_post_url}
              </a>
            )}
            {totals && (
              <p className="muted" style={{ fontSize: 13 }}>
                Acumulado: {totals.views} views · {totals.clicks} cliques · {totals.orders} pedidos · R$
                {totals.commission.toFixed(2)} comissão
              </p>
            )}
            <PerformanceForm publicationId={pub.id} />
          </div>
        );
      })}
    </>
  );
}
