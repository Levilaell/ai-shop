'use client';

import { useState, useTransition } from 'react';
import { publish } from '@/lib/actions';

interface Props {
  videoId: string;
  productId: string;
  defaultAffiliateLink: string;
}

export function PublishForm({ videoId, productId, defaultAffiliateLink }: Props) {
  const [postUrl, setPostUrl] = useState('');
  const [affiliate, setAffiliate] = useState(defaultAffiliateLink);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="card">
      <h3>Registrar publicação</h3>
      <label htmlFor="postUrl">URL do post no TikTok (cole após publicar)</label>
      <input id="postUrl" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
      <label htmlFor="aff">Link de afiliado usado</label>
      <input id="aff" value={affiliate} onChange={(e) => setAffiliate(e.target.value)} />
      <button
        className="primary"
        style={{ marginTop: 12 }}
        disabled={pending || done}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await publish(videoId, productId, postUrl, affiliate);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
      >
        {done ? 'Publicado ✓' : 'Marcar como publicado'}
      </button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
