import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Card-Social',
  description: 'Tu tarjeta digital inteligente',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  );
}
