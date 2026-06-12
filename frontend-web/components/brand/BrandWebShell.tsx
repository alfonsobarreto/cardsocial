'use client';

import type { ReactNode } from 'react';
import BrandNodesBackground from '@/components/brand/BrandNodesBackground';
import type { BrandNodesMode } from '@card-social/styles/brandNodesMesh';

type Props = {
  children: ReactNode;
  mode?: BrandNodesMode;
};

export default function BrandWebShell({ children, mode = 'night' }: Props) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <BrandNodesBackground mode={mode} />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', isolation: 'isolate' }}>{children}</div>
    </div>
  );
}
