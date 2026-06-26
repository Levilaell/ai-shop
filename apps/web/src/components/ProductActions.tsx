'use client';

import { useTransition } from 'react';
import { approveProduct, rejectProduct } from '@/lib/actions';

export function ProductActions({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <button
        className="primary"
        disabled={pending}
        onClick={() => start(() => approveProduct(productId))}
      >
        Aprovar
      </button>
      <button
        className="danger"
        disabled={pending}
        onClick={() => start(() => rejectProduct(productId))}
      >
        Rejeitar
      </button>
    </div>
  );
}
