import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';

export const dynamic = 'force-dynamic';

// Display FX for converting USD production cost to BRL for ROI (matches the
// scorer's default assumption). Real FX integration is out of scope for v1.
const USD_TO_BRL = 5.5;

const brl = (n: number) => `R$${n.toFixed(2)}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

interface Agg {
  title: string;
  costUsd: number;
  videos: number;
  commissionBrl: number;
  gmvBrl: number;
  orders: number;
}

export default async function EconomicsPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: videos }, { data: publications }, { data: performance }] =
    await Promise.all([
      supabase.from('products').select('id, title'),
      supabase.from('videos').select('product_id, cost_usd_actual, cost_usd_estimated'),
      supabase.from('publications').select('id, video_id'),
      supabase.from('performance').select('publication_id, commission_brl, gmv_brl, orders'),
    ]);

  // video_id -> product_id (via videos), publication_id -> product_id (via publications).
  const productByVideo = new Map<string, string>();
  const agg = new Map<string, Agg>();
  for (const p of products ?? []) {
    agg.set(p.id, { title: p.title, costUsd: 0, videos: 0, commissionBrl: 0, gmvBrl: 0, orders: 0 });
  }

  // We need video.id -> product_id, but videos query lacks id; refetch minimal map.
  const { data: videoIds } = await supabase.from('videos').select('id, product_id');
  for (const v of videoIds ?? []) productByVideo.set(v.id, v.product_id);

  for (const v of videos ?? []) {
    const a = agg.get(v.product_id);
    if (!a) continue;
    a.costUsd += Number(v.cost_usd_actual ?? v.cost_usd_estimated ?? 0);
    a.videos += 1;
  }

  const productByPublication = new Map<string, string>();
  for (const pub of publications ?? []) {
    const productId = productByVideo.get(pub.video_id);
    if (productId) productByPublication.set(pub.id, productId);
  }

  for (const perf of performance ?? []) {
    const productId = productByPublication.get(perf.publication_id);
    const a = productId ? agg.get(productId) : undefined;
    if (!a) continue;
    a.commissionBrl += Number(perf.commission_brl ?? 0);
    a.gmvBrl += Number(perf.gmv_brl ?? 0);
    a.orders += Number(perf.orders ?? 0);
  }

  const rows = [...agg.values()].filter((a) => a.videos > 0 || a.commissionBrl > 0);
  const totals = rows.reduce(
    (t, a) => {
      t.costUsd += a.costUsd;
      t.commissionBrl += a.commissionBrl;
      t.gmvBrl += a.gmvBrl;
      t.orders += a.orders;
      t.videos += a.videos;
      return t;
    },
    { costUsd: 0, commissionBrl: 0, gmvBrl: 0, orders: 0, videos: 0 },
  );

  const totalCostBrl = totals.costUsd * USD_TO_BRL;
  const profitBrl = totals.commissionBrl - totalCostBrl;
  const roi = totalCostBrl > 0 ? (profitBrl / totalCostBrl) * 100 : 0;
  const cacUsd = totals.videos > 0 ? totals.costUsd / totals.videos : 0;

  return (
    <>
      <Realtime tables={['videos', 'publications', 'performance', 'products']} />
      <h2>Economia unitária</h2>

      <div className="grid">
        <div className="card">
          <div className="muted">Custo de produção</div>
          <div className="metric">{usd(totals.costUsd)}</div>
          <div className="muted">≈ {brl(totalCostBrl)} @ {USD_TO_BRL}</div>
        </div>
        <div className="card">
          <div className="muted">Comissão acumulada</div>
          <div className="metric">{brl(totals.commissionBrl)}</div>
        </div>
        <div className="card">
          <div className="muted">Lucro</div>
          <div className="metric" style={{ color: profitBrl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {brl(profitBrl)}
          </div>
          <div className="muted">ROI {roi.toFixed(0)}%</div>
        </div>
        <div className="card">
          <div className="muted">CAC por vídeo</div>
          <div className="metric">{usd(cacUsd)}</div>
          <div className="muted">{totals.videos} vídeo(s)</div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Por produto</h3>
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Vídeos</th>
            <th>Custo (USD)</th>
            <th>Comissão (BRL)</th>
            <th>GMV (BRL)</th>
            <th>Pedidos</th>
            <th>ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const costBrl = a.costUsd * USD_TO_BRL;
            const r = costBrl > 0 ? ((a.commissionBrl - costBrl) / costBrl) * 100 : 0;
            return (
              <tr key={a.title}>
                <td>{a.title}</td>
                <td>{a.videos}</td>
                <td>{usd(a.costUsd)}</td>
                <td>{brl(a.commissionBrl)}</td>
                <td>{brl(a.gmvBrl)}</td>
                <td>{a.orders}</td>
                <td style={{ color: r >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Sem dados de custo/performance ainda.</p>}
    </>
  );
}
