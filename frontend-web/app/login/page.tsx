import dynamic from 'next/dynamic';
import { studioTheme } from '@/lib/studioTheme';

const StudioLoginShell = dynamic(() => import('@/components/studio/StudioLoginShell'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: studioTheme.bg,
        color: studioTheme.textMuted,
      }}
    >
      Card-Social...
    </div>
  ),
});

export default function LoginPage() {
  return <StudioLoginShell />;
}
