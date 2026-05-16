import { DeviceEventEmitter } from 'react-native';

const MY_BUSINESS_CARDS_CHANGED = 'cs_my_business_cards_inventory_changed';

/** Tras crear / borrar Business Card: refresca visibilidad del tab Estadísticas (dashboard) sin reiniciar la app. */
export function notifyMyBusinessCardsInventoryChanged(): void {
  DeviceEventEmitter.emit(MY_BUSINESS_CARDS_CHANGED);
}

export function subscribeMyBusinessCardsInventoryChanged(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(MY_BUSINESS_CARDS_CHANGED, listener);
  return () => sub.remove();
}
