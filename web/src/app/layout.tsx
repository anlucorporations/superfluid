import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Superfluid Brlt Streaming v2",
  description:
    "Nómina en streaming con BRLT sobre Besu Codecrypto: panel de administración y Suite del Empleado.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
