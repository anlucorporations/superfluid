import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SFhostpot — WiFi pay-as-you-go',
  description:
    'Acceso WiFi medido en tiempo real con Superfluid. Portal cautivo de demostración; tokens sin valor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
