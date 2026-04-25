import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Card Studio - Card-Social',
  description: 'Manage your card studio from the desktop',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        backgroundColor: '#000000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      }}
    >
      {children}
    </div>
  );
}
