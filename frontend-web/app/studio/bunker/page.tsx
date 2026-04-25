import dynamic from 'next/dynamic';
import { studioTheme } from '@/lib/studioTheme';

const StudioShell = dynamic(() => import('@/components/studio/StudioShell'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        background: studioTheme.bg,
        color: studioTheme.textMuted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
      }}
    >
      Card-Social...
    </div>
  ),
});

export default function StudioBunkerPage() {
  return <StudioShell />;
}
