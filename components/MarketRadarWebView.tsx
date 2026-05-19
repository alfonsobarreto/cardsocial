/**
 * WebView embebido para Market Radar. Responde a `cs-request-location` con el mismo flujo
 * que Social Market (`startSearchLocationSession` → expo-location en primer plano).
 */
import React, { useCallback, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { startSearchLocationSession } from '@/services/searchLocationSession';

/** Debe coincidir con `CS_NATIVE_LOCATION_REQUEST` en frontend-web/lib/marketRadarGeolocation.js */
const CS_NATIVE_LOCATION_REQUEST = 'cs-request-location';

type Props = {
  url: string;
  visible: boolean;
  onClose: () => void;
};

export function MarketRadarWebView({ url, visible, onClose }: Props) {
  const webRef = useRef<WebView>(null);

  const injectNativeLocationResult = useCallback(
    (payload: { ok: true; latitude: number; longitude: number } | { ok: false; reason: string }) => {
      const detail = JSON.stringify(payload);
      webRef.current?.injectJavaScript(`
        (function () {
          try {
            window.dispatchEvent(new CustomEvent('cs-native-location-result', { detail: ${detail} }));
          } catch (e) { console.error('[MarketRadarWebView] inject failed', e); }
        })();
        true;
      `);
    },
    [],
  );

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let msg: { type?: string };
      try {
        msg = JSON.parse(event.nativeEvent.data) as { type?: string };
      } catch {
        return;
      }
      if (msg.type !== CS_NATIVE_LOCATION_REQUEST) return;

      const session = await startSearchLocationSession();
      if (session.ok) {
        injectNativeLocationResult({
          ok: true,
          latitude: session.latitude,
          longitude: session.longitude,
        });
      } else {
        injectNativeLocationResult({ ok: false, reason: session.reason });
      }
    },
    [injectNativeLocationResult],
  );

  if (!visible || !url.trim()) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.closeBar} onPress={onClose} accessibilityRole="button">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <WebView
          ref={webRef}
          source={{ uri: url }}
          style={styles.web}
          onMessage={onMessage}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  closeBar: {
    paddingTop: 48,
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
    backgroundColor: '#000',
  },
  closeText: { color: '#E9C349', fontSize: 22, fontWeight: '800' },
  web: { flex: 1 },
});
