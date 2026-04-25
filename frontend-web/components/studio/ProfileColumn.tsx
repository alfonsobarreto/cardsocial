'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEventHandler, type ReactNode } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  type User,
} from 'firebase/auth';
import { collection, doc, getCountFromServer, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  firestoreStudioUserAvatarUrlWrite,
  firestoreStudioUserFullNameWrite,
  firestoreStudioUserNickNameWrite,
} from '@/lib/studioUserIdentityFields';
import { getStudioDb } from '@/lib/studioFirebase';
import { uploadProfilePhotoWeb } from '@/lib/studioModerationClient';
import {
  propagateUserIdentityAcrossSmartCardsWeb,
  syncProfileAvatarUrlToMongoWeb,
  updateNicknameViaBackend,
} from '@/lib/studioQrClient';
import { studioGradients, studioTheme } from '@/lib/studioTheme';
import type { StudioLocale } from '@/lib/studioI18n';
import { studioT } from '@/lib/studioI18n';

export type StudioProfile = {
  userFullName: string;
  userNickName: string;
  email: string;
  phone: string;
  userAvatarUrl: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  verificationStatus?: string;
  authProvider?: string;
  lastNicknameChange?: string | null;
};

type Props = {
  locale: StudioLocale;
  profile: StudioProfile | null;
  onBack: () => void;
  onDeleteAccount: () => void;
  deletingAccount: boolean;
  user: User;
};

const NICKNAME_COOLDOWN_DAYS = 28;

function nicknameUnlockDate(lastChange: string | null | undefined): Date | null {
  if (!lastChange) return null;
  const d = new Date(lastChange);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + NICKNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

function splitFullName(next: string, firstName?: string, lastName?: string) {
  const parts = next.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || firstName || '',
    lastName: parts.slice(1).join(' ') || lastName || '',
  };
}

export default function ProfileColumn({ locale, profile, onBack, onDeleteAccount, deletingAccount, user }: Props) {
  const t = (k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editName, setEditName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [statsCards, setStatsCards] = useState(0);
  const [statsContacts, setStatsContacts] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setEditName(profile.userFullName || '');
    setEditNickname(profile.userNickName || '');
    setEditBio(String(profile.bio || '').slice(0, 150));
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const db = getStudioDb();
        const [cardsCount, contactsCount, creditsSnap] = await Promise.all([
          getCountFromServer(collection(db, 'users', user.uid, 'smartCards')),
          getCountFromServer(collection(db, 'users', user.uid, 'contacts')),
          getDoc(doc(db, 'users', user.uid, 'credits', 'balance')),
        ]);
        if (cancelled) return;
        setStatsCards(cardsCount.data().count);
        setStatsContacts(contactsCount.data().count);
        setCreditsBalance(Number(creditsSnap.data()?.creditsBalance || 0));
      } catch {
        /* stats are non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, user.uid]);

  const isPasswordUser = (profile?.authProvider || 'password') === 'password';
  const unlock = useMemo(() => nicknameUnlockDate(profile?.lastNicknameChange), [profile?.lastNicknameChange]);
  const nicknameLocked = Boolean(unlock && unlock > new Date());

  const showMessage = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage(null), 4500);
  };

  const saveName = async () => {
    if (!profile) return;
    const next = editName.trim();
    if (!next) return showMessage(t('profile.nameRequired'));
    if (next === profile.userFullName) return showMessage(t('profile.noChanges'));
    setBusy('name');
    try {
      const parts = splitFullName(next, profile.firstName, profile.lastName);
      await updateDoc(doc(getStudioDb(), 'users', user.uid), {
        ...firestoreStudioUserFullNameWrite(next),
        ...parts,
        updatedAt: serverTimestamp(),
      });
      await propagateUserIdentityAcrossSmartCardsWeb(user.uid).catch(() => null);
      showMessage(t('profile.nameSaved'));
    } catch (e) {
      showMessage(e instanceof Error ? e.message : t('profile.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const saveBio = async () => {
    if (!profile) return;
    const trimmed = editBio.trim().slice(0, 150);
    setBusy('bio');
    try {
      await updateDoc(doc(getStudioDb(), 'users', user.uid), { bio: trimmed, updatedAt: serverTimestamp() });
      showMessage(t('profile.bioSaved'));
    } catch (e) {
      showMessage(e instanceof Error ? e.message : t('profile.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const saveNickname = async () => {
    if (!profile) return;
    const next = editNickname.trim();
    if (!next) return showMessage(t('profile.nickRequired'));
    if (next.toLowerCase() === profile.userNickName.toLowerCase()) return showMessage(t('profile.noChanges'));
    if (!/^[a-z0-9._-]{3,24}$/i.test(next)) return showMessage(t('profile.nickInvalid'));
    if (nicknameLocked && unlock) return showMessage(t('profile.nickLocked', { date: unlock.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX') }));
    setBusy('nick');
    try {
      await updateNicknameViaBackend(user.uid, next);
      await updateDoc(doc(getStudioDb(), 'users', user.uid), {
        ...firestoreStudioUserNickNameWrite(next),
        lastNicknameChange: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await propagateUserIdentityAcrossSmartCardsWeb(user.uid).catch(() => null);
      showMessage(t('profile.nickSaved'));
    } catch (e) {
      showMessage(e instanceof Error ? e.message : t('profile.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const onPickPhoto: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return showMessage(t('profile.photoImageOnly'));
    setBusy('photo');
    try {
      const result = await uploadProfilePhotoWeb(file, user.uid);
      const newPhotoUrl = String(result.publicUrl || '').trim();
      if (!newPhotoUrl) throw new Error(t('profile.photoNoUrl'));
      await updateDoc(doc(getStudioDb(), 'users', user.uid), {
        ...firestoreStudioUserAvatarUrlWrite(newPhotoUrl),
        profilePhotoFileId: result.fileId,
        updatedAt: serverTimestamp(),
      });
      await syncProfileAvatarUrlToMongoWeb(user.uid, newPhotoUrl).catch(() => null);
      await propagateUserIdentityAcrossSmartCardsWeb(user.uid).catch(() => null);
      showMessage(t('profile.photoSaved'));
    } catch (e) {
      showMessage(e instanceof Error ? e.message : t('profile.photoError'));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    if (!user.email) return;
    if (!currentPw || !newPw || !confirmPw) return showMessage(t('profile.pwRequired'));
    if (newPw.length < 8) return showMessage(t('profile.pwShort'));
    if (newPw !== confirmPw) return showMessage(t('profile.pwMismatch'));
    setBusy('password');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwOpen(false);
      showMessage(t('profile.pwSaved'));
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') showMessage(t('profile.pwWrong'));
      else if (code === 'auth/requires-recent-login') showMessage(t('profile.pwRecent'));
      else showMessage(e?.message || t('profile.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const requestEmailChange = async () => {
    if (!user.email) return;
    const next = newEmail.trim().toLowerCase();
    const current = String(user.email || profile?.email || '').trim().toLowerCase();
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return showMessage(t('profile.emailInvalid'));
    if (next === current) return showMessage(t('profile.emailSame'));
    if (!emailPw) return showMessage(t('profile.emailPwRequired'));
    setBusy('email');
    try {
      const credential = EmailAuthProvider.credential(user.email, emailPw);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, next);
      await updateDoc(doc(getStudioDb(), 'users', user.uid), {
        pendingEmail: next,
        pendingEmailLower: next,
        emailChangeRequestedAt: serverTimestamp(),
        emailChangeRequestedFrom: 'web',
        updatedAt: serverTimestamp(),
      });
      setNewEmail('');
      setEmailPw('');
      setEmailOpen(false);
      showMessage(t('profile.emailVerificationSent'));
    } catch (e: any) {
      const code = String(e?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') showMessage(t('profile.pwWrong'));
      else if (code === 'auth/email-already-in-use') showMessage(t('profile.emailInUse'));
      else if (code === 'auth/requires-recent-login') showMessage(t('profile.pwRecent'));
      else showMessage(e?.message || t('profile.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const openPhoneSupportTicket = () => {
    const subject = encodeURIComponent('Cambio de telefono - Card-Social');
    const body = encodeURIComponent(
      `Hola soporte Card-Social,\n\nQuiero solicitar cambio de telefono en mi cuenta.\n\nUID: ${user.uid}\nEmail: ${profile?.email || user.email || ''}\nTelefono actual: ${profile?.phone || ''}\n\nEntiendo que el ticket se resuelve en maximo 3 dias habiles.\n`,
    );
    window.location.href = `mailto:support@cardsocial.me?subject=${subject}&body=${body}`;
  };

  const FieldCard = ({ children }: { children: ReactNode }) => (
    <div style={{ borderRadius: 16, border: `1px solid ${studioTheme.border}`, background: studioTheme.surface, padding: 16, marginTop: 12 }}>
      {children}
    </div>
  );

  const PasswordInput = ({
    label,
    value,
    onChange,
    visible,
    onToggle,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    visible: boolean;
    onToggle: () => void;
  }) => (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{ color: studioTheme.textMuted, fontSize: 12 }}>{label}</span>
      <span style={{ position: 'relative', display: 'block', marginTop: 6 }}>
        <input
          value={value}
          type={visible ? 'text' : 'password'}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 10,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: studioTheme.bg,
            color: studioTheme.text,
            padding: '11px 42px 11px 12px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{ position: 'absolute', right: 4, top: 3, width: 34, height: 34, border: 'none', background: 'transparent', color: studioTheme.gold, cursor: 'pointer' }}
        >
          {visible ? t('profile.hide') : t('profile.show')}
        </button>
      </span>
    </label>
  );

  return (
    <div
      style={{
        width: 'min(100vw, 400px)',
        minWidth: 320,
        maxWidth: 420,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${studioTheme.border}`,
        background: studioTheme.bg,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '16px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: studioGradients.brandBar,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: studioTheme.text }}>{t('profile.title')}</h2>
          <p style={{ margin: '8px 0 0', color: studioTheme.textMuted, fontSize: 12 }}>{t('profile.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          style={{
            border: `1px solid ${studioTheme.border}`,
            background: 'transparent',
            color: studioTheme.gold,
            borderRadius: 10,
            padding: '8px 10px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          {t('profile.back')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!profile ? (
          <p style={{ color: studioTheme.textMuted }}>{t('profile.loading')}</p>
        ) : (
          <>
            {message ? (
              <div style={{ padding: 10, borderRadius: 12, background: studioTheme.surfaceElevated, color: studioTheme.goldLight, fontSize: 12, marginBottom: 12 }}>
                {message}
              </div>
            ) : null}

            <div style={{ textAlign: 'center', padding: '8px 0 14px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy === 'photo'}
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: busy === 'photo' ? 'not-allowed' : 'pointer' }}
              >
                {profile.userAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.userAvatarUrl}
                    alt=""
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 26,
                      objectFit: 'cover',
                      border: `2px solid ${studioTheme.gold}`,
                      boxShadow: '0 0 24px rgba(212,175,55,0.2)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 26,
                      border: `2px solid ${studioTheme.gold}`,
                      display: 'grid',
                      placeItems: 'center',
                      color: studioTheme.gold,
                      fontSize: 44,
                      margin: '0 auto',
                    }}
                  >
                    CS
                  </div>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: 'none' }} />
              <div style={{ marginTop: 12, color: studioTheme.text, fontSize: 18, fontWeight: 900 }}>{profile.userFullName || t('profile.user')}</div>
              <div style={{ color: studioTheme.textMuted, fontSize: 13 }}>{profile.userNickName ? `@${profile.userNickName}` : ''}</div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy === 'photo'}
                style={{ marginTop: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.surface, color: studioTheme.gold, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}
              >
                {busy === 'photo' ? t('profile.uploadingPhoto') : t('profile.changePhoto')}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                [statsCards, t('profile.cards')],
                [statsContacts, t('profile.contacts')],
                [creditsBalance, t('profile.credits')],
              ].map(([value, label]) => (
                <div key={String(label)} style={{ border: `1px solid ${studioTheme.border}`, borderRadius: 14, background: studioTheme.surface, padding: 10, textAlign: 'center' }}>
                  <div style={{ color: studioTheme.text, fontWeight: 900, fontSize: 18 }}>{value}</div>
                  <div style={{ color: studioTheme.textMuted, fontSize: 11 }}>{label}</div>
                </div>
              ))}
            </div>

            <FieldCard>
              <div style={{ color: studioTheme.gold, fontSize: 13, fontWeight: 900 }}>{t('profile.bio')}</div>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value.slice(0, 150))}
                placeholder={t('profile.bioPh')}
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, borderRadius: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.bg, color: studioTheme.text, padding: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ color: studioTheme.textSubtle, fontSize: 11 }}>{editBio.length}/150</span>
                <button type="button" onClick={saveBio} disabled={busy === 'bio'} style={{ border: 'none', borderRadius: 10, background: studioTheme.gold, color: studioTheme.bg, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }}>
                  {busy === 'bio' ? t('form.saving') : t('profile.saveBio')}
                </button>
              </div>
            </FieldCard>

            <FieldCard>
              <div style={{ color: studioTheme.gold, fontSize: 13, fontWeight: 900 }}>{t('profile.name')}</div>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, borderRadius: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.bg, color: studioTheme.text, padding: 12 }} />
              <button type="button" onClick={saveName} disabled={busy === 'name'} style={{ width: '100%', marginTop: 10, border: 'none', borderRadius: 10, background: studioTheme.gold, color: studioTheme.bg, padding: '10px 12px', fontWeight: 900, cursor: 'pointer' }}>
                {busy === 'name' ? t('form.saving') : t('profile.saveName')}
              </button>
            </FieldCard>

            <FieldCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ color: studioTheme.gold, fontSize: 13, fontWeight: 900 }}>{t('profile.nick')}</div>
                {nicknameLocked ? <span style={{ color: studioTheme.error, fontSize: 11, fontWeight: 800 }}>{t('profile.locked')}</span> : null}
              </div>
              <input
                value={editNickname}
                disabled={nicknameLocked}
                onChange={(e) => setEditNickname(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, borderRadius: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.bg, color: studioTheme.text, padding: 12, opacity: nicknameLocked ? 0.55 : 1 }}
              />
              <p style={{ color: nicknameLocked ? studioTheme.error : studioTheme.textMuted, fontSize: 11, lineHeight: 1.45 }}>
                {nicknameLocked && unlock ? t('profile.nickLocked', { date: unlock.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX') }) : t('profile.nickHint')}
              </p>
              <button type="button" onClick={saveNickname} disabled={busy === 'nick' || nicknameLocked} style={{ width: '100%', border: 'none', borderRadius: 10, background: nicknameLocked ? studioTheme.textMuted : studioTheme.gold, color: studioTheme.bg, padding: '10px 12px', fontWeight: 900, cursor: nicknameLocked ? 'not-allowed' : 'pointer' }}>
                {busy === 'nick' ? t('form.saving') : t('profile.saveNick')}
              </button>
            </FieldCard>

            <FieldCard>
              <button type="button" onClick={() => isPasswordUser && setEmailOpen((v) => !v)} style={{ width: '100%', border: 'none', background: 'transparent', color: studioTheme.gold, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: isPasswordUser ? 'pointer' : 'default', fontWeight: 900, padding: 0 }}>
                {t('profile.email')}
                {isPasswordUser ? <span>{emailOpen ? '^' : 'v'}</span> : <span style={{ color: studioTheme.textMuted, fontSize: 11 }}>{t('profile.socialAccount')}</span>}
              </button>
              <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.bg, color: studioTheme.textMuted, padding: 12 }}>{profile.email || t('profile.unavailable')}</div>
              <p style={{ color: studioTheme.textMuted, fontSize: 11 }}>{isPasswordUser ? t('profile.emailVerifyHint') : t('profile.emailSocialHint')}</p>
              {isPasswordUser && emailOpen ? (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', marginTop: 10 }}>
                    <span style={{ color: studioTheme.textMuted, fontSize: 12 }}>{t('profile.newEmail')}</span>
                    <input
                      value={newEmail}
                      type="email"
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="name@example.com"
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, borderRadius: 10, border: `1px solid ${studioTheme.borderStrong}`, background: studioTheme.bg, color: studioTheme.text, padding: 12, outline: 'none' }}
                    />
                  </label>
                  <PasswordInput label={t('profile.currentPassword')} value={emailPw} onChange={setEmailPw} visible={showEmailPw} onToggle={() => setShowEmailPw((v) => !v)} />
                  <button type="button" onClick={requestEmailChange} disabled={busy === 'email'} style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 10, background: studioTheme.gold, color: studioTheme.bg, padding: '10px 12px', fontWeight: 900, cursor: 'pointer' }}>
                    {busy === 'email' ? t('profile.sendingVerification') : t('profile.sendEmailVerification')}
                  </button>
                </div>
              ) : null}
            </FieldCard>

            <FieldCard>
              <div style={{ color: studioTheme.gold, fontSize: 13, fontWeight: 900 }}>{t('profile.phone')}</div>
              <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${studioTheme.border}`, background: studioTheme.bg, color: studioTheme.textMuted, padding: 12 }}>{profile.phone || t('profile.unavailable')}</div>
              <p style={{ color: studioTheme.textMuted, fontSize: 11 }}>{t('profile.phoneHint')}</p>
              <button type="button" onClick={openPhoneSupportTicket} style={{ width: '100%', marginTop: 10, border: 'none', borderRadius: 10, background: studioTheme.gold, color: studioTheme.bg, padding: '10px 12px', fontWeight: 900, cursor: 'pointer' }}>
                {t('profile.openTicket')}
              </button>
            </FieldCard>

            {isPasswordUser ? (
              <FieldCard>
                <button type="button" onClick={() => setPwOpen((v) => !v)} style={{ width: '100%', border: 'none', background: 'transparent', color: studioTheme.gold, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 900, padding: 0 }}>
                  {t('profile.changePassword')}
                  <span>{pwOpen ? '^' : 'v'}</span>
                </button>
                {pwOpen ? (
                  <div style={{ marginTop: 8 }}>
                    <PasswordInput label={t('profile.currentPassword')} value={currentPw} onChange={setCurrentPw} visible={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
                    <PasswordInput label={t('profile.newPassword')} value={newPw} onChange={setNewPw} visible={showNew} onToggle={() => setShowNew((v) => !v)} />
                    <PasswordInput label={t('profile.confirmPassword')} value={confirmPw} onChange={setConfirmPw} visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                    <p style={{ color: studioTheme.textMuted, fontSize: 11 }}>{t('profile.pwHint')}</p>
                    <button type="button" onClick={changePassword} disabled={busy === 'password'} style={{ width: '100%', border: 'none', borderRadius: 10, background: studioTheme.gold, color: studioTheme.bg, padding: '10px 12px', fontWeight: 900, cursor: 'pointer' }}>
                      {busy === 'password' ? t('profile.changingPassword') : t('profile.changePassword')}
                    </button>
                  </div>
                ) : null}
              </FieldCard>
            ) : (
              <FieldCard>
                <div style={{ color: studioTheme.gold, fontSize: 13, fontWeight: 900 }}>{t('profile.socialAccount')}</div>
                <p style={{ color: studioTheme.textMuted, fontSize: 12, lineHeight: 1.45 }}>{t('profile.socialHint')}</p>
              </FieldCard>
            )}

            <div style={{ borderTop: `1px solid ${studioTheme.border}`, marginTop: 18, paddingTop: 16, textAlign: 'center' }}>
              <div style={{ color: studioTheme.error, fontWeight: 900, marginBottom: 10 }}>{t('profile.dangerZone')}</div>
              <button
                type="button"
                onClick={onDeleteAccount}
                disabled={deletingAccount}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#B7343A',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  cursor: deletingAccount ? 'not-allowed' : 'pointer',
                  opacity: deletingAccount ? 0.7 : 1,
                }}
              >
                {deletingAccount ? t('profile.deleting') : t('profile.deleteAccount')}
              </button>
              <p style={{ color: studioTheme.textSubtle, fontSize: 11, lineHeight: 1.45, marginTop: 10 }}>{t('profile.deleteHint')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
