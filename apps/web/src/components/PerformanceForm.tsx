'use client';

import { useState, useTransition } from 'react';
import { addPerformance } from '@/lib/actions';

const fields = [
  ['views', 'Views'],
  ['clicks', 'Cliques'],
  ['orders', 'Pedidos'],
  ['gmvBrl', 'GMV (R$)'],
  ['commissionBrl', 'Comissão (R$)'],
] as const;

type Key = (typeof fields)[number][0];

export function PerformanceForm({ publicationId }: { publicationId: string }) {
  const [vals, setVals] = useState<Record<Key, string>>({
    views: '',
    clicks: '',
    orders: '',
    gmvBrl: '',
    commissionBrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  const num = (k: Key): number => Number(vals[k] || 0);

  return (
    <div>
      <div className="grid">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`${key}-${publicationId}`}>{label}</label>
            <input
              id={`${key}-${publicationId}`}
              type="number"
              min="0"
              step="0.01"
              value={vals[key]}
              onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button
        className="primary"
        style={{ marginTop: 10 }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            setOk(false);
            const res = await addPerformance(publicationId, {
              views: num('views'),
              clicks: num('clicks'),
              orders: num('orders'),
              gmvBrl: num('gmvBrl'),
              commissionBrl: num('commissionBrl'),
            });
            if (res.error) setError(res.error);
            else setOk(true);
          })
        }
      >
        {pending ? 'Salvando…' : 'Registrar performance'}
      </button>
      {ok && <span className="ok" style={{ marginLeft: 10 }}>Salvo — score realimentado.</span>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
