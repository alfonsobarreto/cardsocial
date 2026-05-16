import { DeviceEventEmitter } from 'react-native';

export type SubscriptionScrollSection = 'physical_cards' | 'market_radar';

const SUBSCRIPTION_OPEN_EVENT = 'cs_open_subscription_section';

export type SubscriptionOpenPayload = { scrollSection?: SubscriptionScrollSection };

function emitOpen(payload: SubscriptionOpenPayload): void {
  DeviceEventEmitter.emit(SUBSCRIPTION_OPEN_EVENT, payload);
}

/** Abre el panel Suscripción del drawer (sin scroll a una sección concreta). */
export function requestSubscriptionPanel(options?: { delayMs?: number }): void {
  const fire = () => emitOpen({});
  const d = options?.delayMs;
  if (typeof d === 'number' && d > 0) {
    setTimeout(fire, d);
  } else {
    fire();
  }
}

/** Abre Suscripción y hace scroll a la zona de tarjetas físicas / NFC. */
export function requestSubscriptionPhysicalCardsSection(options?: { delayMs?: number }): void {
  const fire = () => emitOpen({ scrollSection: 'physical_cards' });
  const d = options?.delayMs;
  if (typeof d === 'number' && d > 0) {
    setTimeout(fire, d);
  } else {
    fire();
  }
}

/** Abre Suscripción y hace scroll a la zona Market Radar Pro. */
export function requestSubscriptionMarketRadarSection(options?: { delayMs?: number }): void {
  const fire = () => emitOpen({ scrollSection: 'market_radar' });
  const d = options?.delayMs;
  if (typeof d === 'number' && d > 0) {
    setTimeout(fire, d);
  } else {
    fire();
  }
}

export function subscribeSubscriptionPanelOpen(listener: (payload: SubscriptionOpenPayload) => void): () => void {
  const sub = DeviceEventEmitter.addListener(SUBSCRIPTION_OPEN_EVENT, listener);
  return () => sub.remove();
}
