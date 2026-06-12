'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'outline';
  className?: string;
};

/**
 * CTA ultra-lujo alineado a LuxWaitlistLanding (gradiente bronce, tracking, sombra).
 */
export function PremiumButton({ href, children, variant = 'primary', className = '' }: Props) {
  const base =
    'inline-flex min-h-14 items-center justify-center rounded-full px-8 text-sm font-black uppercase tracking-[0.14em] transition duration-300 focus:outline-none focus:ring-2 focus:ring-[#4D8FFF] focus:ring-offset-2 focus:ring-offset-[#071226]';
  const primary =
    'bg-gradient-to-r from-[#4D8FFF] via-[#2F7BFF] to-[#6235E0] text-black shadow-[0_0_34px_rgba(47,123,255,0.34)] hover:-translate-y-0.5 hover:shadow-[0_0_54px_rgba(47,123,255,0.54)]';
  const outline =
    'border border-[#2F7BFF]/35 bg-[#2F7BFF]/10 text-[#4D8FFF] hover:-translate-y-0.5 hover:border-[#2F7BFF]/55 hover:bg-[#2F7BFF]/16';
  return (
    <Link href={href} className={`${base} ${variant === 'primary' ? primary : outline} ${className}`.trim()}>
      {children}
    </Link>
  );
}
