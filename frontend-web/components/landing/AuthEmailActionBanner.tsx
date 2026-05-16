'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { getLandingCopy, type LandingLocale } from '@/lib/landingI18n';

type BannerKind = 'verify' | 'reset' | null;

function detectBannerKind(from: string | null): BannerKind {
  if (!from) return null;
  if (from === 'email-verification') return 'verify';
  if (from === 'reset-password' || from === 'password-reset') return 'reset';
  return null;
}

export function AuthEmailActionBanner({ locale }: { locale: LandingLocale }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BannerKind>(null);

  const stripFromParam = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('from');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const k = detectBannerKind(searchParams.get('from'));
    if (k) {
      setKind(k);
      setOpen(true);
    } else {
      setKind(null);
      setOpen(false);
    }
  }, [searchParams]);

  const close = () => {
    setOpen(false);
    stripFromParam();
  };

  if (!open || !kind) return null;

  const copy = getLandingCopy(locale);
  const text = kind === 'verify' ? copy.authBannerVerify : copy.authBannerReset;

  return (
    <div
      role="status"
      className="fixed left-0 right-0 top-16 z-[60] border-b border-[#E9C349]/40 bg-[#0A0A0A]/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:px-8"
    >
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 sm:items-center">
        <p className="text-sm font-bold leading-snug text-[#F6DA87] sm:text-base">{text}</p>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-full border border-[#E9C349]/45 bg-[#E9C349]/12 px-4 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#F6DA87] transition hover:bg-[#E9C349]/22"
        >
          {copy.authBannerClose}
        </button>
      </div>
    </div>
  );
}
