'use client';

import type { CSSProperties, ReactNode } from 'react';
import { brandGradients } from '@/lib/brandTheme';

type Props = {
  children: ReactNode;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  style?: CSSProperties;
};

const gradientStyle: CSSProperties = {
  backgroundImage: brandGradients.textHighlight,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
};

export default function BrandGradientText({ children, as: Tag = 'span', className, style }: Props) {
  return (
    <Tag className={className} style={{ ...gradientStyle, ...style }}>
      {children}
    </Tag>
  );
}
