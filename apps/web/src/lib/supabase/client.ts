import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@ai-shop/db';

/** Browser Supabase client (RLS-enforced) — used for Realtime subscriptions. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  );
}
