// ActionController.ts
// Controlador central para acciones de iconos Card-Social
import * as Clipboard from 'expo-clipboard';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import {
  joinGhostLinkAgoraSession,
  leaveGhostLinkAgoraSession,
} from '@/services/ghostLinkAgoraSession';
import { isGhostLinkExpoGoAbortError, startGhostLinkVoipCall } from '@/services/ghostLinkVoip';
import { createCallLog } from '@/services/qrApi';
import { Alert, Linking, Platform } from 'react-native';

function normalizeTelDialString(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const compact = raw.replace(/\s+/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) {
    return null;
  }
  return compact;
}

export const ActionController = {
  /**
   * ActionLink: Abre una URL. Encoda con encodeURI() y trunca la URL técnica en la UI.
   */
  async ActionLink({ value, title }: { value: string; title: string }) {
    const raw = String(value || '').trim();
    if (!raw) {
      Alert.alert('Enlace inválido', 'No hay URL para abrir.');
      return;
    }
    const url = encodeURI(raw);
    const displayUrl = url.length > 42 ? `${url.slice(0, 39)}...` : url;
    Alert.alert(
      title || 'Abrir enlace',
      displayUrl,
      [
        { text: 'Abrir', onPress: () => Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir el enlace.')) },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  },

  /**
   * ActionEmail: Deep linking real para Gmail, Outlook, Yahoo y Apple Mail.
   *
   * MAPA DE ESQUEMAS (única fuente de verdad):
   *   gmail   → googlegmail:///co?to=<email>
   *   outlook → ms-outlook://compose?to=<email>
   *   yahoo   → ymail://mail/compose?to=<email>
   *
   * En iOS: pre-chequea Linking.canOpenURL ANTES de mostrar botones.
   *   - App instalada   → botón activo, abre directo.
   *   - App no instalada → botón activo pero avisa y no redirige a Mail sin avisar.
   * En Android: usa mailto: (el sistema presenta el chooser nativo).
   */
  async ActionEmail({ value }: { value: string }) {
    const email = String(value || '').trim();
    if (!email) {
      Alert.alert('Correo inválido', 'No hay un correo válido para abrir.');
      return;
    }

    const encodedEmail = encodeURIComponent(email);
    const mailto = `mailto:${email}`;

    // ─── MAPA CENTRALIZADO DE ESQUEMAS ───────────────────────────────────────
    const EMAIL_CLIENTS: Array<{ id: string; label: string; url: string }> = [
      { id: 'gmail',   label: 'Gmail',   url: `googlegmail:///co?to=${encodedEmail}` },
      { id: 'outlook', label: 'Outlook', url: `ms-outlook://compose?to=${encodedEmail}` },
      { id: 'yahoo',   label: 'Yahoo',   url: `ymail://mail/compose?to=${encodedEmail}` },
    ];
    // ─────────────────────────────────────────────────────────────────────────

    if (Platform.OS !== 'ios') {
      // Android: el chooser del sistema maneja todo
      await Linking.openURL(mailto).catch(() =>
        Alert.alert('Error', 'No se pudo abrir la app de correo.')
      );
      return;
    }

    // iOS: pre-chequear disponibilidad ANTES de mostrar el Alert
    const checked = await Promise.all(
      EMAIL_CLIENTS.map(async (client) => ({
        ...client,
        available: await Linking.canOpenURL(client.url).catch(() => false),
      }))
    );

    type AlertButton = { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' };
    const buttons: AlertButton[] = [];

    // Apple Mail — siempre disponible
    buttons.push({
      text: 'Apple Mail',
      onPress: () => Linking.openURL(mailto).catch(() => null),
    });

    for (const client of checked) {
      if (client.available) {
        // App instalada → abre directo, fallback con aviso si falla
        buttons.push({
          text: client.label,
          onPress: () => {
            Linking.openURL(client.url).catch(() => {
              Alert.alert(
                `${client.label} no disponible`,
                'No se pudo abrir la app. Usando Apple Mail como respaldo.',
                [{ text: 'OK', onPress: () => Linking.openURL(mailto).catch(() => null) }]
              );
            });
          },
        });
      } else {
        // App NO instalada → botón informativo, sin redirigir a Mail a escondidas
        buttons.push({
          text: `${client.label} (no instalado)`,
          onPress: () => {
            Alert.alert(
              `${client.label} no está instalado`,
              'Instala la app para usarla como cliente de correo.',
              [{ text: 'OK' }]
            );
          },
        });
      }
    }

    buttons.push({ text: 'Cancelar', style: 'cancel' });

    Alert.alert('Selecciona app de correo', email, buttons);
  },

  /**
   * Teléfono clásico (Bóveda / CTA): abre el marcador nativo con esquema tel:.
   * Ghost-Link VoIP usa ActionGhostLinkVaultItem (sin Linking, sin número).
   * Parámetros extra se ignoran; se mantienen por compatibilidad con llamadas antiguas.
   */
  async ActionTelefono({
    value,
  }: {
    value: string;
    userName?: string;
    cardName?: string;
    targetUid?: string | null;
    sourceCardName?: string;
    sourceCardId?: string | null;
    onRequireVoipContext?: () => void | Promise<void>;
    fallbackToCallsTab?: boolean;
    enforceGhostLinkOnly?: boolean;
  }) {
    const tel = normalizeTelDialString(value);
    if (!tel) {
      Alert.alert('Teléfono inválido', 'No es un número válido para marcar.');
      return;
    }
    const url = `tel:${tel}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el marcador del sistema.');
    }
  },

  /**
   * Ítem Bóveda "Ghost-Link": sin número ni URL; inicia VoIP hacia el titular de la tarjeta (targetUid).
   */
  async ActionGhostLinkVaultItem({
    targetUid,
    sourceCardName,
    sourceCardId = null,
    userName = 'este contacto',
  }: {
    targetUid: string | null | undefined;
    sourceCardName: string;
    sourceCardId?: string | null;
    userName?: string;
  }) {
    const normalizedTargetUid = String(targetUid || '').trim();
    const resolvedSourceCardName = String(sourceCardName || 'Tarjeta Social').trim();

    if (!normalizedTargetUid) {
      Alert.alert(
        'Ghost-Link',
        'No se puede iniciar la llamada: falta el identificador del titular de la tarjeta.',
      );
      return;
    }

    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      Alert.alert('Sesión requerida', 'Inicia sesión para usar Ghost-Link.');
      return;
    }

    if (ownerUid === normalizedTargetUid) {
      Alert.alert(
        'Vista previa',
        'Al compartir tu tarjeta, tus contactos podrán llamarte por Ghost-Link desde la app. Aquí no se inicia una llamada contigo mismo.',
      );
      return;
    }

    const authenticated = await hardLockCheck('iniciar llamada Ghost-Link');
    if (!authenticated) {
      return;
    }

    try {
      const started = await startGhostLinkVoipCall({
        ownerUid,
        targetUid: normalizedTargetUid,
        card: {
          sourceCardName: resolvedSourceCardName,
          sourceCardId,
        },
      });

      if (started.agora) {
        try {
          await joinGhostLinkAgoraSession(started.agora);
        } catch (agoraErr) {
          if (__DEV__) {
            console.warn('Ghost-Link Agora (caller join):', agoraErr);
          }
        }
      }

      await createCallLog({
        ownerUid,
        peerUid: normalizedTargetUid,
        direction: 'outgoing',
        status: 'completed',
        durationSec: 0,
        tags: ['Ghost-Link'],
        sourceCardName: resolvedSourceCardName,
        sourceCardId,
        callChannel: 'ghost-link-voip',
      });

      if (started.agora) {
        Alert.alert(
          'Ghost-Link',
          `En llamada con ${userName}. Tu número real permanece oculto. Pulsa Colgar para terminar el audio.`,
          [
            {
              text: 'Colgar',
              style: 'destructive',
              onPress: () => {
                void leaveGhostLinkAgoraSession();
              },
            },
          ],
          { cancelable: false },
        );
      } else {
        Alert.alert(
          'Ghost-Link',
          `Señalización enviada a ${userName}. Para audio real, configura AGORA_APP_ID y AGORA_APP_CERTIFICATE en el backend.`,
        );
      }
    } catch (error: any) {
      if (isGhostLinkExpoGoAbortError(error)) {
        return;
      }
      Alert.alert(
        'No se pudo iniciar Ghost-Link',
        error?.message || 'Intenta nuevamente.',
      );
    }
  },

  /**
   * ActionText: Modal flotante con el texto completo.
   * Encabezado = Nombre del Dato (title). Botones: Copiar y Cancelar.
   */
  async ActionText({ value, title }: { value: string; title?: string }) {
    const text = String(value || '');
    Alert.alert(
      title || 'Texto',
      text,
      [
        {
          text: 'Copiar',
          onPress: async () => {
            await Clipboard.setStringAsync(text);
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  },

  /**
   * ActionDocument: Flujo asíncrono estilo WhatsApp hacia DigitalOcean.
   * Cierra el modal del frontend de INMEDIATO y deja que el backend procese en silencio.
   */
  async ActionDocument({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    // Cierra el modal del frontend de inmediato — igual que WhatsApp al enviar
    closeModal?.();

    // Si hay un uploadCallback, lanza el proceso en background silenciosamente
    if (uploadCallback) {
      uploadCallback().catch(() => {
        // Error silencioso: el usuario ya no ve el modal
      });
      return;
    }

    // Si es solo visualización (sin upload), abre la URL
    const url = String(value || '').trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Documento', 'No se pudo abrir el documento.');
      }
      return;
    }

    Alert.alert('Documento', url || 'No hay documento disponible.');
  },

  /**
   * ActionImage: Similar to ActionDocument but for images.
   * Closes the modal immediately and processes the image upload in the background.
   */
  async ActionImage({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    // Close the modal immediately
    closeModal?.();

    // Launch the upload process in the background
    if (uploadCallback) {
      setTimeout(() => {
        uploadCallback().catch(() => {
          // Silent error handling
        });
      }, 0);
      return;
    }

    // If no uploadCallback, log the value for debugging
    console.log('No uploadCallback provided for ActionImage:', value);
  },
};
