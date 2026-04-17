import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Card-Social',
  description: 'Tu tarjeta digital inteligente',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#E0F7FA',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  );
}
