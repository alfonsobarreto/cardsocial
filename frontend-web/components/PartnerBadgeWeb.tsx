'use client';

import React from 'react';

const BLUE = '#0A84FF';

/**
 * SVG compacto (~22px): anillo cyan + centro azul con check para “Socio oficial”.
 */
export default function PartnerBadgeWeb(props: {
  /** Ancho/alto px (opcional). */
  sizePx?: number;
  title?: string;
}) {
  const s = Math.max(16, props.sizePx ?? 22);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      role="img"
      aria-label={props.title || 'Socio oficial verificado'}
    >
      <circle cx={12} cy={12} r={11} fill="rgba(90,200,250,0.15)" stroke="#5AC8FA" strokeWidth={1} />
      <circle cx={12} cy={12} r={8} fill={BLUE} />
      <path
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m7 12 3 3 7-7"
      />
    </svg>
  );
}
