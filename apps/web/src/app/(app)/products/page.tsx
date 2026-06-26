import type { ScoreBreakdown } from '@ai-shop/shared';
import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';
import { ProductActions } from '@/components/ProductActions';
import { IngestForm } from '@/components/IngestForm';

export const dynamic = 'force-dynamic';

// A score_breakdown is "shaped" only when it came from the scorer (ingestion).
// Seed/manually-inserted rows may carry an empty `{}` — guard against that.
function isShapedBreakdown(b: ScoreBreakdown | null | undefined): b is ScoreBreakdown {
  return Boolean(b && b.demonstrability && b.priceRange && b.commissionVsCost && b.claimSafety);
}

function Breakdown({ b }: { b: ScoreBreakdown }) {
  const parts = [
    ['Demonstrabilidade', b.demonstrability],
    ['Faixa de preço', b.priceRange],
    ['Comissão vs custo', b.commissionVsCost],
    ['Compliance/claims', b.claimSafety],
  ] as const;
  return (
    <table style={{ marginTop: 8 }}>
      <tbody>
        {parts.map(([label, c]) => (
          <tr key={label}>
            <td className="muted">{label}</td>
            <td>{(c.raw * 100).toFixed(0)}%</td>
            <td className="muted" style={{ fontSize: 12 }}>
              {c.reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, title, category, price_brl, commission_pct, score, score_breakdown, status')
    .eq('status', 'product_candidate')
    .order('score', { ascending: false, nullsFirst: false });

  return (
    <>
      <Realtime tables={['products']} />
      <h2>Fila de aprovação de produtos</h2>
      <IngestForm />
      {(products ?? []).length === 0 && <p className="muted">Nenhum candidato. Importe um CSV acima.</p>}
      {(products ?? []).map((p) => {
        const b = p.score_breakdown as unknown as ScoreBreakdown;
        return (
          <div className="card" key={p.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{p.title}</strong>
              <span className="tag">score {p.score != null ? Number(p.score).toFixed(1) : '—'}</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {p.category ?? 'sem categoria'} · R${Number(p.price_brl).toFixed(2)} · {Number(p.commission_pct)}% comissão
            </div>
            {b?.blocked && (
              <p className="err" style={{ fontSize: 13 }}>
                ⚠ Bloqueado: {b.blockReasons?.join(' ')}
              </p>
            )}
            {isShapedBreakdown(b) ? (
              <Breakdown b={b} />
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>
                Sem detalhamento de score (produto do seed) — importe via CSV para pontuar.
              </p>
            )}
            <ProductActions productId={p.id} />
          </div>
        );
      })}
    </>
  );
}
