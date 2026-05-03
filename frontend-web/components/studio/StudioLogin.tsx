'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getStudioAuth } from '@/lib/studioFirebase';
import { studioTheme } from '@/lib/studioTheme';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';

type Props = {
  locale: StudioLocale;
  username: string;
  password: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
};

export default function StudioLogin({
  locale,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  loading,
  error,
}: Props) {
  const t = (k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<'password' | 'username' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const maskEmail = (email: string) => {
    const [localRaw, domainRaw] = email.split('@');
    const local = localRaw || '';
    const domain = domainRaw || '';
    const first = local.slice(0, 1);
    const last = local.length > 2 ? local.slice(-1) : '';
    const domainParts = domain.split('.');
    const tld = domainParts.length > 1 ? domainParts.pop() : '';
    return `${first}${'*'.repeat(Math.max(4, local.length - 2))}${last}@${'*'.repeat(Math.max(5, domainParts.join('.').length))}${tld ? `.${tld}` : ''}`;
  };

  const requestUsernameRecovery = async (phone: string) => {
    const baseUrl = (process.env.NEXT_PUBLIC_MODERATION_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || '').replace(/\/+$/, '');
    const gatewayKey = process.env.NEXT_PUBLIC_MODERATION_GATEWAY_KEY?.trim() || process.env.NEXT_PUBLIC_API_GATEWAY_KEY?.trim() || '';
    if (!baseUrl || !gatewayKey) return;
    await fetch(`${baseUrl}/api/recovery/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-gateway-key': gatewayKey },
      body: JSON.stringify({ phone }),
    }).catch(() => null);
  };

  const submitRecovery = async () => {
    setRecovering(true);
    setRecoveryMessage(null);
    try {
      if (recoveryMode === 'password') {
        const email = recoveryEmail.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setRecoveryMessage(t('recovery.emailRequired'));
          return;
        }
        await sendPasswordResetEmail(getStudioAuth(), email).catch(() => null);
        setRecoveryMode(null);
        setRecoveryMessage(t('recovery.passwordSent'));
        setRecoveryEmail('');
      } else if (recoveryMode === 'username') {
        const phone = recoveryPhone.trim();
        if (phone.replace(/[^\d]/g, '').length < 8) {
          setRecoveryMessage(t('recovery.phoneRequired'));
          return;
        }
        await requestUsernameRecovery(phone);
        setRecoveryMode(null);
        setRecoveryMessage(t('recovery.usernameSent'));
        setRecoveryPhone('');
      }
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
        background: studioTheme.bg,
        color: studioTheme.text,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 392,
          padding: '22px 20px 18px',
          borderRadius: 12,
          border: `1px solid ${studioTheme.border}`,
          background: '#111111',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 18,
            fontWeight: 700,
            color: studioTheme.text,
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          Welcome to the Bunker
          <br />
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14, marginTop: 8, color: studioTheme.goldLight }}>
            where you can create your IconDatas much faster.
          </span>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 16, marginTop: 12 }}>
            Sign in to Card-Social
          </span>
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: studioTheme.textMuted, lineHeight: 1.5, textAlign: 'center' }}>
          {t('login.hint')}
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: studioTheme.goldLight, marginBottom: 6 }}>{t('login.username')}</label>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${studioTheme.border}`,
            background: '#1C1C1E',
            color: studioTheme.text,
            fontSize: 14,
          }}
        />

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: studioTheme.goldLight, marginBottom: 6 }}>{t('login.password')}</label>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && onSubmit()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 48px 12px 14px',
              borderRadius: 10,
              border: `1px solid ${studioTheme.border}`,
              background: '#1C1C1E',
              color: studioTheme.text,
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 38,
              height: 38,
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: studioTheme.textMuted,
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>

        {error ? (
          <p role="alert" style={{ color: studioTheme.error, fontSize: 13, margin: '0 0 12px' }}>
            {error}
          </p>
        ) : null}
        {recoveryMessage ? (
          <p role="status" style={{ color: studioTheme.goldLight, fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
            {recoveryMessage}
          </p>
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={onSubmit}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.75 : 1,
            background: studioTheme.gold,
            color: '#111111',
          }}
        >
          {loading ? t('login.signingIn') : t('login.submit')}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => {
              setRecoveryMessage(null);
              setRecoveryEmail('');
              setRecoveryMode('password');
            }}
            style={{ border: 'none', background: 'transparent', color: studioTheme.goldLight, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
          >
            {t('recovery.forgotPassword')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryMessage(null);
              setRecoveryPhone('');
              setRecoveryMode('username');
            }}
            style={{ border: 'none', background: 'transparent', color: studioTheme.goldLight, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
          >
            {t('recovery.forgotUsername')}
          </button>
        </div>
      </div>

      {recoveryMode ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 390, borderRadius: 16, border: `1px solid ${studioTheme.border}`, background: studioTheme.surface, padding: 22 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{recoveryMode === 'password' ? t('recovery.passwordTitle') : t('recovery.usernameTitle')}</h2>
            <p style={{ color: studioTheme.textMuted, fontSize: 13, lineHeight: 1.5 }}>
              {recoveryMode === 'password'
                ? username.trim().includes('@')
                  ? t('recovery.passwordBodyMasked', { email: maskEmail(username.trim().toLowerCase()) })
                  : t('recovery.passwordBody')
                : t('recovery.usernameBody')}
            </p>
            <input
              value={recoveryMode === 'password' ? recoveryEmail : recoveryPhone}
              onChange={(e) => (recoveryMode === 'password' ? setRecoveryEmail(e.target.value) : setRecoveryPhone(e.target.value))}
              type={recoveryMode === 'password' ? 'email' : 'tel'}
              placeholder={recoveryMode === 'password' ? 'name@example.com' : '+1 555 000 0000'}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: `1px solid ${studioTheme.borderStrong}`, background: studioTheme.surfaceElevated, color: studioTheme.text }}
            />
            {recoveryMessage ? <p style={{ color: studioTheme.error, fontSize: 12 }}>{recoveryMessage}</p> : null}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setRecoveryMode(null)} style={{ border: `1px solid ${studioTheme.border}`, background: 'transparent', color: studioTheme.text, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
                {t('dirty.discard')}
              </button>
              <button type="button" disabled={recovering} onClick={() => void submitRecovery()} style={{ border: 'none', background: studioTheme.gold, color: studioTheme.bg, borderRadius: 10, padding: '10px 14px', cursor: recovering ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                {recovering ? t('profile.sendingVerification') : t('recovery.continue')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
