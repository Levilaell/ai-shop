'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <div style={{ maxWidth: 360, margin: '12vh auto' }}>
      <div className="card">
        <h2>ai-shop</h2>
        <p className="muted">Painel de afiliados (TikTok Shop)</p>
        <form action={formAction}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" defaultValue="operator@local.test" required />
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" defaultValue="password123" required />
          {state.error && (
            <p className="err" style={{ marginTop: 10 }}>
              {state.error}
            </p>
          )}
          <button className="primary" type="submit" disabled={pending} style={{ marginTop: 14 }}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
