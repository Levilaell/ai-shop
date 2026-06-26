'use client';

import { useState, useTransition } from 'react';
import { AI_LABEL_REMINDER } from '@ai-shop/shared';
import { submitCompliance, approveCompliance } from '@/lib/actions';

interface Props {
  videoId: string;
  productId: string;
  claimsOk: boolean | null;
  reviewed: boolean;
  gateOk: boolean;
  gateReasons: readonly string[];
  publishHref: string;
}

export function ComplianceForm({
  videoId,
  productId,
  claimsOk,
  reviewed,
  gateOk,
  gateReasons,
  publishHref,
}: Props) {
  const [claims, setClaims] = useState<boolean>(claimsOk === true);
  const [ackLabel, setAckLabel] = useState<boolean>(reviewed);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <label className="row" style={{ display: 'flex', gap: 8 }}>
        <input
          type="checkbox"
          checked={ackLabel}
          style={{ width: 'auto' }}
          onChange={(e) => setAckLabel(e.target.checked)}
        />
        <span>{AI_LABEL_REMINDER}</span>
      </label>
      <label className="row" style={{ display: 'flex', gap: 8 }}>
        <input
          type="checkbox"
          checked={claims}
          style={{ width: 'auto' }}
          onChange={(e) => setClaims(e.target.checked)}
        />
        <span>Confirmo que o vídeo não faz claim exagerado nem proibido.</span>
      </label>
      <label htmlFor={`notes-${videoId}`}>Notas (opcional)</label>
      <textarea
        id={`notes-${videoId}`}
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button
          disabled={pending || !ackLabel}
          onClick={() =>
            start(async () => {
              setError(null);
              await submitCompliance(videoId, claims, notes);
            })
          }
        >
          Salvar checklist
        </button>
        <button
          className="primary"
          disabled={pending || !gateOk}
          title={gateOk ? '' : gateReasons.join(' ')}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await approveCompliance(productId);
              if (res.error) setError(res.error);
            })
          }
        >
          Liberar para publicação
        </button>
        {gateOk && <a href={publishHref}>→ Tela de publicação</a>}
      </div>

      {!gateOk && (
        <ul className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          {gateReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
