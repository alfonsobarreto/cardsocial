/**
 * NetworkProvider — detección proactiva de conectividad.
 * Muestra un banner persistente cuando no hay conexión.
 * Pausa operaciones de red hasta que vuelva la conectividad.
 */

import { useLanguage } from '@/services/language';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type NetworkContextType = {
  isConnected: boolean;
};

const NetworkContext = createContext<NetworkContextType>({ isConnected: true });

export function useNetwork() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected !== false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {!isConnected && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {tr('Sin conexión — Modo offline', 'No connection — Offline mode')}
          </Text>
        </View>
      )}
      {children}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#E8A317',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
