'use client';

import { resolveCardStudioFreeIconDef, CARD_STUDIO_FALLBACK_ICON_DEF } from '@/lib/cardStudioFreeIconPaths';
import type { SlotIconDef } from '@/lib/slotIcons';

function glyph(def: SlotIconDef, size: number, color: string) {
  return (
    <svg width={size} height={size} viewBox={def.viewBox ?? '0 0 24 24'} style={{ display: 'block', color }}>
      <path d={def.path} fill="currentColor" />
    </svg>
  );
}

export default function StudioMdiGlyph({ name, size, color }: { name: string; size: number; color: string }) {
  if (name.startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={name} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 4 }} />;
  }
  const def = resolveCardStudioFreeIconDef(name) ?? CARD_STUDIO_FALLBACK_ICON_DEF;
  return glyph(def, size, color);
}
