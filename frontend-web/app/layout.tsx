import type { Metadata } from 'next';

import { RevenueCatWebProvider } from '@/components/RevenueCatWebProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Card-Social',
  description: 'Your smart digital card',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: '100vh',
      }}>
        <RevenueCatWebProvider>{children}</RevenueCatWebProvider>
      </body>
    </html>
  );
}
