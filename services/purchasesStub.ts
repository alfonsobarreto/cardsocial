/**
 * Stub for react-native-purchases (RevenueCat) used when running in Expo Go.
 * Purchase calls always throw a cancellation-like error so the rest of the
 * app can display its UI without crashing.  Production / EAS builds should
 * use the real `react-native-purchases` package instead of this file.
 */

const Purchases = {
  purchaseProduct: async (_productId: string): Promise<never> => {
    throw Object.assign(
      new Error('Las compras dentro de la app no están disponibles en Expo Go. Usa una compilación de producción.'),
      { userCancelled: true }
    );
  },

  restorePurchases: async (): Promise<void> => {
    // no-op in Expo Go
  },

  getCustomerInfo: async () => ({
    entitlements: { active: {} as Record<string, unknown> },
    originalAppUserId: '',
  }),
};

export default Purchases;
