'use client';

import { useTransition } from 'react';
import { approveScript } from '@/lib/actions';

export function ScriptApprove({ scriptId }: { scriptId: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="primary" disabled={pending} onClick={() => start(() => approveScript(scriptId))}>
      {pending ? '…' : 'Aprovar este ângulo'}
    </button>
  );
}
