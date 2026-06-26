'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribes to Postgres changes on the given tables and refreshes the current
 * route (re-runs the Server Component data fetch) on any change. Realtime honors
 * RLS, so we only receive our own account's rows. This gives the whole dashboard
 * live updates without per-component state wiring.
 */
export function Realtime({ tables }: { tables: readonly string[] }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('dashboard-changes');
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        router.refresh();
      });
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, tables]);

  return null;
}
