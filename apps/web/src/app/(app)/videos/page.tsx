import { createClient } from '@/lib/supabase/server';
import { Realtime } from '@/components/Realtime';

export const dynamic = 'force-dynamic';

const usd = (n: number | null) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export default async function VideosPage() {
  const supabase = await createClient();
  const { data: videos } = await supabase
    .from('videos')
    .select(
      'id, product_id, status, avatar_tier, cost_usd_estimated, cost_usd_actual, duration_seconds, video_url, error, retry_count, created_at',
    )
    .order('created_at', { ascending: false });

  return (
    <>
      <Realtime tables={['videos']} />
      <h2>Fila de vídeos</h2>
      {(videos ?? []).length === 0 && <p className="muted">Nenhum vídeo ainda.</p>}
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Tier</th>
            <th>Custo est.</th>
            <th>Custo real</th>
            <th>Duração</th>
            <th>Retries</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {(videos ?? []).map((v) => (
            <tr key={v.id}>
              <td>
                <span className="tag">{v.status}</span>
                {v.error && <div className="err" style={{ fontSize: 12 }}>{v.error}</div>}
              </td>
              <td>{v.avatar_tier.toUpperCase()}</td>
              <td>{usd(v.cost_usd_estimated)}</td>
              <td>{usd(v.cost_usd_actual)}</td>
              <td>{v.duration_seconds != null ? `${Number(v.duration_seconds).toFixed(0)}s` : '—'}</td>
              <td>{v.retry_count}</td>
              <td>{v.video_url ? <a href={v.video_url} target="_blank" rel="noreferrer">abrir</a> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
