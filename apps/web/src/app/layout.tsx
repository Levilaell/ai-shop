import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'ai-shop — Painel',
  description: 'Pipeline de afiliados com IA (TikTok Shop)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
