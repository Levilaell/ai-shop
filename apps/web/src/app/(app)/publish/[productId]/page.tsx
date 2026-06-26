import { notFound } from 'next/navigation';
import { buildCaption, AI_LABEL_REMINDER } from '@ai-shop/shared';
import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';
import { PublishForm } from '@/components/PublishForm';

export const dynamic = 'force-dynamic';

export default async function PublishPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select('id, title, affiliate_link, status')
    .eq('id', productId)
    .maybeSingle();
  if (!product) notFound();

  const { data: script } = await supabase
    .from('scripts')
    .select('hook, body, cta')
    .eq('product_id', productId)
    .eq('status', 'script_approved')
    .maybeSingle();

  const { data: video } = await supabase
    .from('videos')
    .select('id, video_url')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const caption = script ? buildCaption(script) : '';

  return (
    <>
      <Realtime tables={['products', 'publications']} />
      <h2>Publicação manual — {product.title}</h2>
      <p className="tag">{product.status}</p>

      <div className="card" style={{ borderColor: 'var(--amber)' }}>
        <strong>⚠ Lembrete</strong>
        <p>{AI_LABEL_REMINDER}</p>
      </div>

      <div className="card">
        <h3>1. Vídeo</h3>
        {video?.video_url ? (
          <a href={video.video_url} target="_blank" rel="noreferrer">
            Baixar / abrir vídeo
          </a>
        ) : (
          <span className="muted">Vídeo ainda sem URL.</span>
        )}
      </div>

      <div className="card">
        <h3>2. Legenda / roteiro</h3>
        <textarea rows={6} readOnly defaultValue={caption} />
      </div>

      <div className="card">
        <h3>3. Link de afiliado</h3>
        <input readOnly defaultValue={product.affiliate_link ?? ''} />
      </div>

      {video && (
        <PublishForm
          videoId={video.id}
          productId={product.id}
          defaultAffiliateLink={product.affiliate_link ?? ''}
        />
      )}
    </>
  );
}
