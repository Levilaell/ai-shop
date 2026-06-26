import { evaluateComplianceGate, type ComplianceChecklist } from '@ai-shop/shared';
import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';
import { ComplianceForm } from '@/components/ComplianceForm';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from('products')
    .select('id, title')
    .eq('status', 'compliance_review');

  const ids = (products ?? []).map((p) => p.id);
  const { data: videos } = ids.length
    ? await supabase.from('videos').select('id, product_id, video_url').in('product_id', ids)
    : { data: [] };

  const videoIds = (videos ?? []).map((v) => v.id);
  const { data: checks } = videoIds.length
    ? await supabase
        .from('compliance_checks')
        .select('video_id, ai_label_required, claims_ok, reviewed_by, reviewed_at')
        .in('video_id', videoIds)
    : { data: [] };

  const checkByVideo = new Map((checks ?? []).map((c) => [c.video_id, c]));
  const titleByProduct = new Map((products ?? []).map((p) => [p.id, p.title]));

  return (
    <>
      <Realtime tables={['products', 'videos', 'compliance_checks']} />
      <h2>Checklist de compliance</h2>
      {(videos ?? []).length === 0 && <p className="muted">Nenhum vídeo aguardando compliance.</p>}
      {(videos ?? []).map((v) => {
        const check = checkByVideo.get(v.id) ?? null;
        const checklist: ComplianceChecklist | null = check
          ? {
              ai_label_required: check.ai_label_required,
              claims_ok: check.claims_ok,
              reviewed_by: check.reviewed_by,
              reviewed_at: check.reviewed_at,
            }
          : null;
        const gate = evaluateComplianceGate(checklist);
        return (
          <div className="card" key={v.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{titleByProduct.get(v.product_id) ?? v.product_id}</strong>
              {v.video_url && (
                <a href={v.video_url} target="_blank" rel="noreferrer">
                  ver vídeo
                </a>
              )}
            </div>
            <ComplianceForm
              videoId={v.id}
              productId={v.product_id}
              claimsOk={checklist?.claims_ok ?? null}
              reviewed={Boolean(checklist?.reviewed_at)}
              gateOk={gate.ok}
              gateReasons={gate.reasons}
              publishHref={`/publish/${v.product_id}`}
            />
          </div>
        );
      })}
    </>
  );
}
