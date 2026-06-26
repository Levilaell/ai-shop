import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/account';
import { SignOutButton } from '@/components/SignOutButton';

const NAV: { href: string; label: string }[] = [
  { href: '/board', label: 'Board (pipeline)' },
  { href: '/products', label: 'Fila de produtos' },
  { href: '/scripts', label: 'Fila de roteiros' },
  { href: '/videos', label: 'Fila de vídeos' },
  { href: '/compliance', label: 'Compliance' },
  { href: '/tracking', label: 'Tracking & feedback' },
  { href: '/economics', label: 'Economia unitária' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>ai-shop</h1>
        <nav>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
        <p className="muted" style={{ marginTop: 24, fontSize: 12 }}>
          {user.email}
        </p>
        <SignOutButton />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
