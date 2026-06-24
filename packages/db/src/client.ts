import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export type AiShopClient = SupabaseClient<Database>;

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * Service-role client for the worker. **BYPASSES RLS.**
 * The worker MUST filter `account_id` explicitly in every query (spec §2).
 */
export function createServiceClient(
  url: string | undefined = process.env['SUPABASE_URL'],
  serviceRoleKey: string | undefined = process.env['SUPABASE_SERVICE_ROLE_KEY'],
): AiShopClient {
  return createClient<Database>(
    required('SUPABASE_URL', url),
    required('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Anonymous client (RLS-enforced). Pass a signed-in user's access token to act
 * on their behalf from a server context. Browser/SSR helpers arrive in T7.
 */
export function createAnonClient(
  accessToken?: string,
  url: string | undefined = process.env['SUPABASE_URL'],
  anonKey: string | undefined = process.env['SUPABASE_ANON_KEY'],
): AiShopClient {
  return createClient<Database>(
    required('SUPABASE_URL', url),
    required('SUPABASE_ANON_KEY', anonKey),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {}),
    },
  );
}
