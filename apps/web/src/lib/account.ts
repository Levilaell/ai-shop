import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface CurrentUser {
  readonly userId: string;
  readonly email: string | undefined;
  readonly accountId: string;
}

/**
 * Resolve the signed-in user and their account (via account_users membership).
 * Redirects to /login if unauthenticated. Throws if the user has no membership
 * (shouldn't happen for seeded operators).
 */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership, error } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar conta: ${error.message}`);
  if (!membership) throw new Error('Usuário sem conta associada (account_users vazio).');

  return { userId: user.id, email: user.email, accountId: membership.account_id };
}
