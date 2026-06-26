import { PIPELINE_STATUSES, type PipelineStatus } from '@ai-shop/shared';
import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';

export const dynamic = 'force-dynamic';

const LABELS: Record<PipelineStatus, string> = {
  product_candidate: 'Candidato',
  product_approved: 'Aprovado',
  script_generating: 'Gerando roteiro',
  script_ready: 'Roteiro pronto',
  script_approved: 'Roteiro aprovado',
  video_generating: 'Gerando vídeo',
  video_ready: 'Vídeo pronto',
  compliance_review: 'Compliance',
  ready_to_publish: 'Pronto p/ publicar',
  published: 'Publicado',
  tracking: 'Tracking',
  archived: 'Arquivado',
  rejected: 'Rejeitado',
};

// Board shows the product as it moves through the pipeline. Terminal off-ramp
// 'rejected' is hidden to keep the board focused on live work.
const COLUMNS = PIPELINE_STATUSES.filter((s) => s !== 'rejected');

export default async function BoardPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, title, score, status')
    .order('score', { ascending: false, nullsFirst: false });

  const byStatus = new Map<PipelineStatus, typeof products>();
  for (const p of products ?? []) {
    const arr = byStatus.get(p.status) ?? [];
    arr.push(p);
    byStatus.set(p.status, arr);
  }

  return (
    <>
      <Realtime tables={['products', 'scripts', 'videos', 'compliance_checks', 'publications']} />
      <h2>Pipeline</h2>
      <div className="board">
        {COLUMNS.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <div className="column" key={status}>
              <h3>
                {LABELS[status]} ({items.length})
              </h3>
              {items.map((p) => (
                <div className="card" key={p.id} style={{ marginBottom: 8 }}>
                  <div>{p.title}</div>
                  {p.score != null && <span className="tag">score {Number(p.score).toFixed(0)}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
