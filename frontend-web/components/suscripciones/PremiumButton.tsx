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
    'inline-flex min-h-14 items-center justify-center rounded-full px-8 text-sm font-black uppercase tracking-[0.14em] transition duration-300 focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]';
  const primary =
    'bg-gradient-to-r from-[#F6DA87] via-[#E9C349] to-[#A87B1F] text-black shadow-[0_0_34px_rgba(233,195,73,0.34)] hover:-translate-y-0.5 hover:shadow-[0_0_54px_rgba(233,195,73,0.54)]';
  const outline =
    'border border-[#E9C349]/35 bg-[#E9C349]/10 text-[#F6DA87] hover:-translate-y-0.5 hover:border-[#E9C349]/55 hover:bg-[#E9C349]/16';
  return (
    <Link href={href} className={`${base} ${variant === 'primary' ? primary : outline} ${className}`.trim()}>
      {children}
    </Link>
  );
}
