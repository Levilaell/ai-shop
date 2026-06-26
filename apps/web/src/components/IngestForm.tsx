'use client';

import { useState, useTransition } from 'react';
import { ingestProducts, type IngestResult } from '@/lib/actions';

const SAMPLE = 'external_ref,title,price_brl,commission_pct,category,affiliate_link';

export function IngestForm() {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<IngestResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <details className="card">
      <summary>Importar produtos (CSV)</summary>
      <p className="muted" style={{ fontSize: 12 }}>
        Cabeçalho: <code>{SAMPLE}</code> (+ opcional <code>affiliate_platform</code>).
      </p>
      <textarea
        rows={5}
        placeholder={`${SAMPLE}\nTT-9001,Mini aspirador portátil,89.90,20,tech_acessorios,https://shop.tiktok.com/aff/TT-9001`}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      <button
        className="primary"
        style={{ marginTop: 10 }}
        disabled={pending || csv.trim() === ''}
        onClick={() =>
          start(async () => {
            setResult(await ingestProducts(csv));
          })
        }
      >
        {pending ? 'Importando…' : 'Importar'}
      </button>
      {result && (
        <div style={{ marginTop: 10 }}>
          {result.error ? (
            <p className="err">{result.error}</p>
          ) : (
            <p className="ok">{result.inserted} produto(s) importado(s).</p>
          )}
          {result.rowErrors.length > 0 && (
            <ul className="muted" style={{ fontSize: 12 }}>
              {result.rowErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
