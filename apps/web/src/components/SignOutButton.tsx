'use client';

import { signOut } from '@/app/login/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" style={{ width: '100%', marginTop: 16 }}>
        Sair
      </button>
    </form>
  );
}
