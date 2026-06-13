import { DeviceEventEmitter } from 'react-native';

const SUBSCRIPTION_OPEN_EVENT = 'cs_open_subscription_section';
const NFC_PHYSICAL_CHECKOUT_EVENT = 'cs_open_nfc_physical_checkout';
const MARKET_RADAR_UPSELL_EVENT = 'cs_open_market_radar_upsell';
const CS_CREDIT_PACKS_EVENT = 'cs_open_cs_credit_packs';
const BUSINESS_ANNUAL_LICENSE_EVENT = 'cs_open_business_annual_license';
const BUSINESS_LICENSE_ACTIVATED_EVENT = 'cs_business_license_activated';

export type BusinessAnnualLicensePayload = { bId: string };
export type BusinessLicenseActivatedPayload = { bId: string };

function emitSubscriptionOpen(): void {
  DeviceEventEmitter.emit(SUBSCRIPTION_OPEN_EVENT, {});
}

function emitNfcPhysicalCheckout(): void {
  DeviceEventEmitter.emit(NFC_PHYSICAL_CHECKOUT_EVENT);
}

function emitMarketRadarUpsell(): void {
  DeviceEventEmitter.emit(MARKET_RADAR_UPSELL_EVENT);
}

function emitCsCreditPacks(): void {
  DeviceEventEmitter.emit(CS_CREDIT_PACKS_EVENT);
}

function emitBusinessAnnualLicense(bId: string): void {
  DeviceEventEmitter.emit(BUSINESS_ANNUAL_LICENSE_EVENT, { bId });
}

function scheduleEmit(fire: () => void, delayMs?: number): void {
  if (typeof delayMs === 'number' && delayMs > 0) {
    setTimeout(fire, delayMs);
  } else {
    fire();
  }
}

/** Abre el panel Suscripción del drawer (solo tiers). */
export function requestSubscriptionPanel(options?: { delayMs?: number }): void {
  scheduleEmit(emitSubscriptionOpen, options?.delayMs);
}

/** Abre el modal contextual de tarjeta física NFC (PVC/metal + envío). */
export function requestNfcPhysicalCheckout(options?: { delayMs?: number }): void {
  scheduleEmit(emitNfcPhysicalCheckout, options?.delayMs);
}

/** @deprecated Usar `requestNfcPhysicalCheckout`. */
export function requestSubscriptionPhysicalCardsSection(options?: { delayMs?: number }): void {
  requestNfcPhysicalCheckout(options);
}

/** Upsell contextual de Market Radar Pro (dashboard / búsqueda). */
export function requestMarketRadarProUpsell(options?: { delayMs?: number }): void {
  scheduleEmit(emitMarketRadarUpsell, options?.delayMs);
}

/** @deprecated Usar `requestMarketRadarProUpsell`. */
export function requestSubscriptionMarketRadarSection(options?: { delayMs?: number }): void {
  requestMarketRadarProUpsell(options);
}

/** Pantalla contextual de packs CS (`/vault_store`). */
export function requestCsCreditPacksStore(options?: { delayMs?: number }): void {
  scheduleEmit(emitCsCreditPacks, options?.delayMs);
}

/** Modal contextual: licencia anual Social Market para una tarjeta de negocio. */
export function requestBusinessAnnualLicense(
  bId: string,
  options?: { delayMs?: number },
): void {
  const id = String(bId || '').trim();
  if (!id) return;
  scheduleEmit(() => emitBusinessAnnualLicense(id), options?.delayMs);
}

export function subscribeSubscriptionPanelOpen(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(SUBSCRIPTION_OPEN_EVENT, listener);
  return () => sub.remove();
}

export function subscribeNfcPhysicalCheckoutOpen(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(NFC_PHYSICAL_CHECKOUT_EVENT, listener);
  return () => sub.remove();
}

export function subscribeMarketRadarProUpsellOpen(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(MARKET_RADAR_UPSELL_EVENT, listener);
  return () => sub.remove();
}

export function subscribeCsCreditPacksOpen(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(CS_CREDIT_PACKS_EVENT, listener);
  return () => sub.remove();
}

export function subscribeBusinessAnnualLicenseOpen(
  listener: (payload: BusinessAnnualLicensePayload) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(BUSINESS_ANNUAL_LICENSE_EVENT, listener);
  return () => sub.remove();
}

function emitBusinessLicenseActivated(bId: string): void {
  DeviceEventEmitter.emit(BUSINESS_LICENSE_ACTIVATED_EVENT, { bId });
}

/** Notifica que una licencia anual se activó (p. ej. tras IAP). */
export function notifyBusinessLicenseActivated(bId: string): void {
  const id = String(bId || '').trim();
  if (!id) return;
  emitBusinessLicenseActivated(id);
}

export function subscribeBusinessLicenseActivated(
  listener: (payload: BusinessLicenseActivatedPayload) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener(BUSINESS_LICENSE_ACTIVATED_EVENT, listener);
  return () => sub.remove();
}
