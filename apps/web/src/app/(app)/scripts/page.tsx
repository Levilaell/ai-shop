import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';
import { ScriptApprove } from '@/components/ScriptApprove';

export const dynamic = 'force-dynamic';

export default async function ScriptsPage() {
  const supabase = await createClient();

  // Products awaiting script approval.
  const { data: products } = await supabase
    .from('products')
    .select('id, title')
    .eq('status', 'script_ready')
    .order('score', { ascending: false, nullsFirst: false });

  interface ScriptRow {
    id: string;
    product_id: string;
    angle: string;
    hook: string;
    body: string;
    cta: string;
    variant_index: number;
    model_used: string | null;
  }

  const ids = (products ?? []).map((p) => p.id);
  const scripts: ScriptRow[] = ids.length
    ? (
        await supabase
          .from('scripts')
          .select('id, product_id, angle, hook, body, cta, variant_index, model_used')
          .in('product_id', ids)
          .eq('status', 'script_ready')
          .order('variant_index', { ascending: true })
      ).data ?? []
    : [];

  const byProduct = new Map<string, ScriptRow[]>();
  for (const s of scripts) {
    const arr = byProduct.get(s.product_id) ?? [];
    arr.push(s);
    byProduct.set(s.product_id, arr);
  }

  return (
    <>
      <Realtime tables={['scripts', 'products']} />
      <h2>Fila de aprovação de roteiros</h2>
      {(products ?? []).length === 0 && <p className="muted">Nenhum roteiro aguardando aprovação.</p>}
      {(products ?? []).map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.title}</strong>
          <p className="muted" style={{ fontSize: 12 }}>
            Aprove um ângulo — só ele dispara o vídeo (HeyGen, custo).
          </p>
          <div className="grid">
            {(byProduct.get(p.id) ?? []).map((s) => (
              <div className="card" key={s.id} style={{ background: 'var(--panel-2)' }}>
                <span className="tag">#{s.variant_index + 1} · {s.angle}</span>
                <p>
                  <strong>Hook:</strong> {s.hook}
                </p>
                <p style={{ fontSize: 13 }}>{s.body}</p>
                <p className="muted" style={{ fontSize: 13 }}>
                  CTA: {s.cta}
                </p>
                <ScriptApprove scriptId={s.id} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
