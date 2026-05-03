import { premiumTheme } from '@/styles/_premiumTheme';

/** Dorado oficial para pantallas auth / premium. */
export const AUTH_GOLD = '#D4AF37' as const;
export const AUTH_ON_GOLD_DARK = premiumTheme.dark.onAccent;

const pl = premiumTheme.light;

export const authScreenGradient = (isNight: boolean) =>
  isNight ? (['#000000', '#0A0A0A', '#141414'] as const) : (['#FFFFFF', '#F6F4EE', '#EDE8DC'] as const);

export const bunkerLockGradient = (isNight: boolean) => authScreenGradient(isNight);

export type AuthScreenLook = {
  gradient: readonly [string, string, string];
  heroRingBg: string;
  heroRingBorder: string;
  title: string;
  subtitle: string;
  socialTitle: string;
  inputWrapBg: string;
  inputWrapBorder: string;
  inputText: string;
  placeholderColor: string;
  iconColor: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  footerLink: string;
  secondaryLink: string;
  submitOverlay: string;
  submitCardBg: string;
  submitCardBorder: string;
  submitText: string;
  recoveryCardBg: string;
  recoveryCardBorder: string;
  recoveryTitle: string;
  recoveryBody: string;
  recoveryInputWrapBg: string;
  recoveryInputWrapBorder: string;
  recoveryInputText: string;
  spinnerColor: string;
};

export type RegisterFormLook = AuthScreenLook & {
  label: string;
  helper: string;
  socialState: string;
  photoBtnBg: string;
  photoBtnBorder: string;
  photoBtnText: string;
  inputBg: string;
  inputBorder: string;
  phoneDialBg: string;
  phoneDialBorder: string;
  phoneDialText: string;
  phoneChevron: string;
  passwordRowBg: string;
  passwordRowBorder: string;
  calendarBorder: string;
  calendarBg: string;
  geoBtnBg: string;
  geoBtnBorder: string;
  geoBtnText: string;
  readOnlyBg: string;
  readOnlyText: string;
  readOnlyBorder: string;
  registerBtnBg: string;
  registerBtnText: string;
  legalBorder: string;
  legalCheckboxBg: string;
  legalText: string;
  legalCheckedBg: string;
  legalCheckedBorder: string;
  progressCardBg: string;
  progressCardBorder: string;
  progressLabel: string;
  eyeIcon: string;
  validationMuted: string;
  countryPickerSurface: string;
  countryPickerTextPrimary: string;
  countryPickerBorder: string;
  countryPickerInputBg: string;
};

export function authScreenLook(isNight: boolean): AuthScreenLook {
  if (isNight) {
    return {
      gradient: authScreenGradient(true),
      heroRingBg: '#1C1C1E',
      heroRingBorder: AUTH_GOLD,
      title: '#FFFFFF',
      subtitle: '#AEAEB2',
      socialTitle: '#8E8E93',
      inputWrapBg: '#1C1C1E',
      inputWrapBorder: AUTH_GOLD,
      inputText: '#FFFFFF',
      placeholderColor: '#8E8E93',
      iconColor: AUTH_GOLD,
      primaryBtnBg: AUTH_GOLD,
      primaryBtnText: AUTH_ON_GOLD_DARK,
      footerLink: AUTH_GOLD,
      secondaryLink: AUTH_GOLD,
      submitOverlay: 'rgba(0,0,0,0.72)',
      submitCardBg: '#1C1C1E',
      submitCardBorder: AUTH_GOLD,
      submitText: '#FFFFFF',
      recoveryCardBg: '#1C1C1E',
      recoveryCardBorder: AUTH_GOLD,
      recoveryTitle: '#FFFFFF',
      recoveryBody: '#AEAEB2',
      recoveryInputWrapBg: '#0A0A0A',
      recoveryInputWrapBorder: AUTH_GOLD,
      recoveryInputText: '#FFFFFF',
      spinnerColor: AUTH_GOLD,
    };
  }

  return {
    gradient: authScreenGradient(false),
    heroRingBg: '#FFFFFF',
    heroRingBorder: AUTH_GOLD,
    title: pl.text,
    subtitle: pl.textSecondary,
    socialTitle: pl.textSecondary,
    inputWrapBg: pl.surfaceElevated,
    inputWrapBorder: AUTH_GOLD,
    inputText: pl.text,
    placeholderColor: pl.muted,
    iconColor: pl.textSecondary,
    primaryBtnBg: AUTH_GOLD,
    primaryBtnText: pl.onAccent,
    footerLink: pl.text,
    secondaryLink: pl.text,
    submitOverlay: 'rgba(15, 20, 25, 0.4)',
    submitCardBg: 'rgba(255,255,255,0.96)',
    submitCardBorder: AUTH_GOLD,
    submitText: pl.text,
    recoveryCardBg: pl.surfaceElevated,
    recoveryCardBorder: AUTH_GOLD,
    recoveryTitle: pl.text,
    recoveryBody: pl.textSecondary,
    recoveryInputWrapBg: pl.surface,
    recoveryInputWrapBorder: AUTH_GOLD,
    recoveryInputText: pl.text,
    spinnerColor: pl.text,
  };
}

export function registerFormLook(isNight: boolean): RegisterFormLook {
  const base = authScreenLook(isNight);
  if (isNight) {
    return {
      ...base,
      label: '#FFFFFF',
      helper: '#AEAEB2',
      socialState: '#E5E5EA',
      photoBtnBg: '#1C1C1E',
      photoBtnBorder: AUTH_GOLD,
      photoBtnText: AUTH_GOLD,
      inputBg: '#1C1C1E',
      inputBorder: AUTH_GOLD,
      phoneDialBg: '#1C1C1E',
      phoneDialBorder: AUTH_GOLD,
      phoneDialText: '#FFFFFF',
      phoneChevron: AUTH_GOLD,
      passwordRowBg: '#1C1C1E',
      passwordRowBorder: AUTH_GOLD,
      calendarBorder: AUTH_GOLD,
      calendarBg: '#1C1C1E',
      geoBtnBg: '#1C1C1E',
      geoBtnBorder: AUTH_GOLD,
      geoBtnText: AUTH_GOLD,
      readOnlyBg: '#0A0A0A',
      readOnlyText: '#FFFFFF',
      readOnlyBorder: AUTH_GOLD,
      registerBtnBg: AUTH_GOLD,
      registerBtnText: AUTH_ON_GOLD_DARK,
      legalBorder: AUTH_GOLD,
      legalCheckboxBg: '#1C1C1E',
      legalText: '#E5E5EA',
      legalCheckedBg: AUTH_GOLD,
      legalCheckedBorder: AUTH_GOLD,
      progressCardBg: '#1C1C1E',
      progressCardBorder: AUTH_GOLD,
      progressLabel: '#FFFFFF',
      eyeIcon: AUTH_GOLD,
      validationMuted: '#AEAEB2',
      countryPickerSurface: '#1C1C1E',
      countryPickerTextPrimary: '#FFFFFF',
      countryPickerBorder: AUTH_GOLD,
      countryPickerInputBg: '#0A0A0A',
    };
  }

  return {
    ...base,
    label: pl.text,
    helper: pl.textSecondary,
    socialState: pl.text,
    photoBtnBg: 'rgba(255,255,255,0.92)',
    photoBtnBorder: AUTH_GOLD,
    photoBtnText: pl.text,
    inputBg: pl.surfaceElevated,
    inputBorder: AUTH_GOLD,
    phoneDialBg: pl.surfaceElevated,
    phoneDialBorder: AUTH_GOLD,
    phoneDialText: pl.text,
    phoneChevron: pl.textSecondary,
    passwordRowBg: pl.surfaceElevated,
    passwordRowBorder: AUTH_GOLD,
    calendarBorder: AUTH_GOLD,
    calendarBg: pl.surfaceElevated,
    geoBtnBg: 'rgba(255,255,255,0.92)',
    geoBtnBorder: AUTH_GOLD,
    geoBtnText: pl.text,
    readOnlyBg: pl.surface,
    readOnlyText: pl.text,
    readOnlyBorder: AUTH_GOLD,
    registerBtnBg: AUTH_GOLD,
    registerBtnText: pl.onAccent,
    legalBorder: pl.text,
    legalCheckboxBg: 'rgba(255,255,255,0.85)',
    legalText: pl.text,
    legalCheckedBg: AUTH_GOLD,
    legalCheckedBorder: AUTH_GOLD,
    progressCardBg: 'rgba(255,255,255,0.94)',
    progressCardBorder: AUTH_GOLD,
    progressLabel: pl.text,
    eyeIcon: pl.textSecondary,
    validationMuted: pl.textSecondary,
    countryPickerSurface: '#FFFFFF',
    countryPickerTextPrimary: pl.text,
    countryPickerBorder: AUTH_GOLD,
    countryPickerInputBg: 'rgba(255,255,255,0.95)',
  };
}
import { premiumTheme } from '@/styles/_premiumTheme';

/** Dorado oficial (web / premium). */
export const AUTH_GOLD = '#D4AF37' as const;

/** Etiqueta UI para proveedor OAuth (registro / estado). */
export function oauthProviderLabel(id: string | null | undefined): string {
  const p = String(id || '').toLowerCase();
  if (p === 'google' || p === 'oauth_google' || p === 'google.com') return 'Google';
  if (p === 'apple' || p === 'oauth_apple' || p === 'apple.com') return 'Apple';
  if (p === 'github' || p === 'oauth_github' || p === 'github.com') return 'GitHub';
  return p || 'OAuth';
}
/** Texto sobre dorado en modo oscuro. */
export const AUTH_ON_GOLD_DARK = premiumTheme.dark.onAccent;

const pl = premiumTheme.light;

/** Degradado pantallas auth: noche = negro → gris muy oscuro; día = premium claro cálido. */
export const authScreenGradient = (isNight: boolean) =>
  isNight ? (['#000000', '#0A0A0A', '#141414'] as const) : (['#FFFFFF', '#F6F4EE', '#EDE8DC'] as const);

/** Degradado pantalla bloqueo Búnker (misma línea visual que Login). */
export const bunkerLockGradient = (isNight: boolean) => authScreenGradient(isNight);

export type AuthScreenLook = {
  gradient: readonly [string, string, string];
  heroRingBg: string;
  heroRingBorder: string;
  title: string;
  subtitle: string;
  socialTitle: string;
  inputWrapBg: string;
  inputWrapBorder: string;
  inputText: string;
  placeholderColor: string;
  iconColor: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  footerLink: string;
  secondaryLink: string;
  submitOverlay: string;
  submitCardBg: string;
  submitCardBorder: string;
  submitText: string;
  recoveryCardBg: string;
  recoveryCardBorder: string;
  recoveryTitle: string;
  recoveryBody: string;
  recoveryInputWrapBg: string;
  recoveryInputWrapBorder: string;
  recoveryInputText: string;
  spinnerColor: string;
};

/** Tokens extra para pantalla de registro (misma línea Negro/Dorado). */
export type RegisterFormLook = AuthScreenLook & {
  label: string;
  helper: string;
  socialState: string;
  photoBtnBg: string;
  photoBtnBorder: string;
  photoBtnText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  phoneDialBg: string;
  phoneDialBorder: string;
  phoneDialText: string;
  phoneChevron: string;
  passwordRowBg: string;
  passwordRowBorder: string;
  calendarBorder: string;
  calendarBg: string;
  geoBtnBg: string;
  geoBtnBorder: string;
  geoBtnText: string;
  readOnlyBg: string;
  readOnlyText: string;
  readOnlyBorder: string;
  otpCardBg: string;
  otpCardBorder: string;
  otpTitle: string;
  otpSendBtnBg: string;
  otpVerifyBg: string;
  registerBtnBg: string;
  registerBtnText: string;
  legalBorder: string;
  legalCheckboxBg: string;
  legalText: string;
  legalCheckedBg: string;
  legalCheckedBorder: string;
  progressCardBg: string;
  progressCardBorder: string;
  progressLabel: string;
  progressPercent: string;
  androidPrimaryBtn: string;
  eyeIcon: string;
  validationMuted: string;
  countryPickerSurface: string;
  countryPickerTextPrimary: string;
  countryPickerBorder: string;
  countryPickerInputBg: string;
};

export function registerFormLook(isNight: boolean): RegisterFormLook {
  const base = authScreenLook(isNight);
  if (isNight) {
    return {
      ...base,
      label: '#FFFFFF',
      helper: '#AEAEB2',
      socialState: '#E5E5EA',
      photoBtnBg: '#1C1C1E',
      photoBtnBorder: AUTH_GOLD,
      photoBtnText: AUTH_GOLD,
      inputBg: '#1C1C1E',
      inputBorder: AUTH_GOLD,
      inputText: '#FFFFFF',
      phoneDialBg: '#1C1C1E',
      phoneDialBorder: AUTH_GOLD,
      phoneDialText: '#FFFFFF',
      phoneChevron: AUTH_GOLD,
      passwordRowBg: '#1C1C1E',
      passwordRowBorder: AUTH_GOLD,
      calendarBorder: AUTH_GOLD,
      calendarBg: '#1C1C1E',
      geoBtnBg: '#1C1C1E',
      geoBtnBorder: AUTH_GOLD,
      geoBtnText: AUTH_GOLD,
      readOnlyBg: '#0A0A0A',
      readOnlyText: '#FFFFFF',
      readOnlyBorder: AUTH_GOLD,
      otpCardBg: '#1C1C1E',
      otpCardBorder: AUTH_GOLD,
      otpTitle: '#FFFFFF',
      otpSendBtnBg: AUTH_GOLD,
      otpVerifyBg: AUTH_GOLD,
      registerBtnBg: AUTH_GOLD,
      registerBtnText: AUTH_ON_GOLD_DARK,
      legalBorder: AUTH_GOLD,
      legalCheckboxBg: '#1C1C1E',
      legalText: '#E5E5EA',
      legalCheckedBg: AUTH_GOLD,
      legalCheckedBorder: AUTH_GOLD,
      progressCardBg: '#1C1C1E',
      progressCardBorder: AUTH_GOLD,
      progressLabel: '#FFFFFF',
      progressPercent: AUTH_GOLD,
      androidPrimaryBtn: AUTH_GOLD,
      eyeIcon: AUTH_GOLD,
      validationMuted: '#AEAEB2',
      countryPickerSurface: '#1C1C1E',
      countryPickerTextPrimary: '#FFFFFF',
      countryPickerBorder: AUTH_GOLD,
      countryPickerInputBg: '#0A0A0A',
    };
  }
  return {
    ...base,
    label: pl.text,
    helper: pl.textSecondary,
    socialState: pl.text,
    photoBtnBg: 'rgba(255,255,255,0.92)',
    photoBtnBorder: AUTH_GOLD,
    photoBtnText: pl.text,
    inputBg: pl.surfaceElevated,
    inputBorder: AUTH_GOLD,
    inputText: pl.text,
    phoneDialBg: pl.surfaceElevated,
    phoneDialBorder: AUTH_GOLD,
    phoneDialText: pl.text,
    phoneChevron: pl.textSecondary,
    passwordRowBg: pl.surfaceElevated,
    passwordRowBorder: AUTH_GOLD,
    calendarBorder: AUTH_GOLD,
    calendarBg: pl.surfaceElevated,
    geoBtnBg: 'rgba(255,255,255,0.92)',
    geoBtnBorder: AUTH_GOLD,
    geoBtnText: pl.text,
    readOnlyBg: pl.surface,
    readOnlyText: pl.text,
    readOnlyBorder: AUTH_GOLD,
    otpCardBg: 'rgba(255,255,255,0.9)',
    otpCardBorder: AUTH_GOLD,
    otpTitle: pl.text,
    otpSendBtnBg: AUTH_GOLD,
    otpVerifyBg: AUTH_GOLD,
    registerBtnBg: AUTH_GOLD,
    registerBtnText: pl.onAccent,
    legalBorder: pl.text,
    legalCheckboxBg: 'rgba(255,255,255,0.85)',
    legalText: pl.text,
    legalCheckedBg: AUTH_GOLD,
    legalCheckedBorder: AUTH_GOLD,
    progressCardBg: 'rgba(255,255,255,0.94)',
    progressCardBorder: AUTH_GOLD,
    progressLabel: pl.text,
    progressPercent: pl.text,
    androidPrimaryBtn: AUTH_GOLD,
    eyeIcon: pl.textSecondary,
    validationMuted: pl.textSecondary,
    countryPickerSurface: '#FFFFFF',
    countryPickerTextPrimary: pl.text,
    countryPickerBorder: AUTH_GOLD,
    countryPickerInputBg: 'rgba(255,255,255,0.95)',
  };
}

export function authScreenLook(isNight: boolean): AuthScreenLook {
  if (isNight) {
    return {
      gradient: authScreenGradient(true),
      heroRingBg: '#1C1C1E',
      heroRingBorder: AUTH_GOLD,
      title: '#FFFFFF',
      subtitle: '#AEAEB2',
      socialTitle: '#8E8E93',
      inputWrapBg: '#1C1C1E',
      inputWrapBorder: AUTH_GOLD,
      inputText: '#FFFFFF',
      placeholderColor: '#8E8E93',
      iconColor: AUTH_GOLD,
      primaryBtnBg: AUTH_GOLD,
      primaryBtnText: AUTH_ON_GOLD_DARK,
      footerLink: AUTH_GOLD,
      secondaryLink: AUTH_GOLD,
      submitOverlay: 'rgba(0,0,0,0.72)',
      submitCardBg: '#1C1C1E',
      submitCardBorder: AUTH_GOLD,
      submitText: '#FFFFFF',
      recoveryCardBg: '#1C1C1E',
      recoveryCardBorder: AUTH_GOLD,
      recoveryTitle: '#FFFFFF',
      recoveryBody: '#AEAEB2',
      recoveryInputWrapBg: '#0A0A0A',
      recoveryInputWrapBorder: AUTH_GOLD,
      recoveryInputText: '#FFFFFF',
      spinnerColor: AUTH_GOLD,
    };
  }
  return {
    gradient: authScreenGradient(false),
    heroRingBg: '#FFFFFF',
    heroRingBorder: AUTH_GOLD,
    title: pl.text,
    subtitle: pl.textSecondary,
    socialTitle: pl.textSecondary,
    inputWrapBg: pl.surfaceElevated,
    inputWrapBorder: AUTH_GOLD,
    inputText: pl.text,
    placeholderColor: pl.muted,
    iconColor: pl.textSecondary,
    primaryBtnBg: AUTH_GOLD,
    primaryBtnText: pl.onAccent,
    footerLink: pl.text,
    secondaryLink: pl.text,
    submitOverlay: 'rgba(15, 20, 25, 0.4)',
    submitCardBg: 'rgba(255,255,255,0.96)',
    submitCardBorder: AUTH_GOLD,
    submitText: pl.text,
    recoveryCardBg: pl.surfaceElevated,
    recoveryCardBorder: AUTH_GOLD,
    recoveryTitle: pl.text,
    recoveryBody: pl.textSecondary,
    recoveryInputWrapBg: pl.surface,
    recoveryInputWrapBorder: AUTH_GOLD,
    recoveryInputText: pl.text,
    spinnerColor: pl.text,
  };
}
