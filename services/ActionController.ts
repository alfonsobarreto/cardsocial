// ActionController.ts
// Controlador central para acciones de iconos Card-Social
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import {
  joinGhostLinkAgoraSession,
  leaveGhostLinkAgoraSession,
} from '@/services/ghostLinkAgoraSession';
import { isGhostLinkExpoGoAbortError, startGhostLinkVoipCall } from '@/services/ghostLinkVoip';
import {
  dismissPremiumDataPanel,
  presentPremiumDataPanel,
} from '@/services/premiumDataPanelController';
import { createCallLog } from '@/services/qrApi';
import { Linking, Platform } from 'react-native';
import Toast from 'react-native-toast-message';

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
      presentPremiumDataPanel({
        title: 'Enlace inválido',
        body: 'No hay URL para abrir.',
        icon: 'link-variant',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
      return;
    }
    const url = encodeURI(raw);
    const displayUrl = url.length > 42 ? `${url.slice(0, 39)}...` : url;
    presentPremiumDataPanel({
      title: title || 'Abrir enlace',
      body: displayUrl,
      icon: 'link-variant',
      copyText: url,
      actions: [
        {
          label: 'Abrir',
          variant: 'primary',
          onPress: () => {
            dismissPremiumDataPanel();
            void Linking.openURL(url).catch(() =>
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'No se pudo abrir el enlace.',
              }),
            );
          },
        },
        { label: 'Cancelar', variant: 'secondary', onPress: dismissPremiumDataPanel },
      ],
    });
  },

  /**
   * ActionEmail: Deep linking real para Gmail, Outlook, Yahoo y Apple Mail.
   */
  async ActionEmail({ value }: { value: string }) {
    const email = String(value || '').trim();
    if (!email) {
      presentPremiumDataPanel({
        title: 'Correo inválido',
        body: 'No hay un correo válido para abrir.',
        icon: 'email-outline',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
      return;
    }

    const encodedEmail = encodeURIComponent(email);
    const mailto = `mailto:${email}`;

    const EMAIL_CLIENTS: Array<{ id: string; label: string; url: string }> = [
      { id: 'gmail', label: 'Gmail', url: `googlegmail:///co?to=${encodedEmail}` },
      { id: 'outlook', label: 'Outlook', url: `ms-outlook://compose?to=${encodedEmail}` },
      { id: 'yahoo', label: 'Yahoo', url: `ymail://mail/compose?to=${encodedEmail}` },
    ];

    if (Platform.OS !== 'ios') {
      await Linking.openURL(mailto).catch(() =>
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: 'No se pudo abrir la app de correo.',
        }),
      );
      return;
    }

    const checked = await Promise.all(
      EMAIL_CLIENTS.map(async (client) => ({
        ...client,
        available: await Linking.canOpenURL(client.url).catch(() => false),
      })),
    );

    const rows: Array<{ key: string; label: string; onPress: () => void }> = [];

    rows.push({
      key: 'apple-mail',
      label: 'Apple Mail',
      onPress: () => {
        dismissPremiumDataPanel();
        void Linking.openURL(mailto).catch(() =>
          Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo abrir Apple Mail.' }),
        );
      },
    });

    for (const client of checked) {
      if (client.available) {
        rows.push({
          key: client.id,
          label: client.label,
          onPress: () => {
            dismissPremiumDataPanel();
            void Linking.openURL(client.url).catch(() => {
              Toast.show({
                type: 'info',
                text1: `${client.label} no disponible`,
                text2: 'Abriendo Apple Mail como respaldo.',
              });
              void Linking.openURL(mailto).catch(() =>
                Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo abrir el correo.' }),
              );
            });
          },
        });
      } else {
        rows.push({
          key: `${client.id}-na`,
          label: `${client.label} (no instalado)`,
          onPress: () => {
            dismissPremiumDataPanel();
            Toast.show({
              type: 'info',
              text1: `${client.label} no está instalado`,
              text2: 'Instala la app para usarla como cliente de correo.',
            });
          },
        });
      }
    }

    rows.push({
      key: 'cancel',
      label: 'Cancelar',
      onPress: () => dismissPremiumDataPanel(),
    });

    presentPremiumDataPanel({
      title: 'Selecciona app de correo',
      email,
      icon: 'email-outline',
      copyText: email,
      emailOptions: rows,
    });
  },

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
      presentPremiumDataPanel({
        title: 'Teléfono inválido',
        body: 'No es un número válido para marcar.',
        icon: 'phone-alert',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
      return;
    }
    const url = `tel:${tel}`;
    try {
      await Linking.openURL(url);
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'No se pudo abrir el marcador del sistema.',
      });
    }
  },

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
      presentPremiumDataPanel({
        title: 'Ghost-Link',
        body: 'No se puede iniciar la llamada: falta el identificador del titular de la tarjeta.',
        icon: 'shield-lock-outline',
        actions: [{ label: 'Entendido', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
      return;
    }

    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      presentPremiumDataPanel({
        title: 'Sesión requerida',
        body: 'Inicia sesión para usar Ghost-Link.',
        icon: 'account-lock-outline',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
      return;
    }

    if (ownerUid === normalizedTargetUid) {
      presentPremiumDataPanel({
        title: 'Vista previa',
        body: 'Al compartir tu tarjeta, tus contactos podrán llamarte por Ghost-Link desde la app. Aquí no se inicia una llamada contigo mismo.',
        icon: 'eye-outline',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
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
        presentPremiumDataPanel({
          title: 'Ghost-Link',
          body: `En llamada con ${userName}. Tu número real permanece oculto. Pulsa Colgar para terminar el audio.`,
          icon: 'phone-in-talk',
          hideCopy: true,
          dismissOnBackdropPress: false,
          actions: [
            {
              label: 'Colgar',
              variant: 'destructive',
              onPress: () => {
                void leaveGhostLinkAgoraSession();
                dismissPremiumDataPanel();
              },
            },
          ],
        });
      } else {
        presentPremiumDataPanel({
          title: 'Ghost-Link',
          body: `Señalización enviada a ${userName}. Para audio real, configura AGORA_APP_ID y AGORA_APP_CERTIFICATE en el backend.`,
          icon: 'phone-outline',
          actions: [{ label: 'Entendido', variant: 'secondary', onPress: dismissPremiumDataPanel }],
        });
      }
    } catch (error: any) {
      if (isGhostLinkExpoGoAbortError(error)) {
        return;
      }
      presentPremiumDataPanel({
        title: 'No se pudo iniciar Ghost-Link',
        body: error?.message || 'Intenta nuevamente.',
        icon: 'alert-circle-outline',
        actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
      });
    }
  },

  async ActionText({ value, title }: { value: string; title?: string }) {
    const text = String(value || '');
    presentPremiumDataPanel({
      title: title || 'Texto',
      body: text || '—',
      icon: 'text-box-outline',
      copyText: text,
      actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
    });
  },

  /**
   * Misma UX que ActionText (panel premium) para datos crudos de la bóveda.
   */
  async ActionRaw({ value, title }: { value: string; title?: string }) {
    await ActionController.ActionText({ value, title });
  },

  async ActionDocument({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    closeModal?.();

    if (uploadCallback) {
      uploadCallback().catch(() => {});
      return;
    }

    const url = String(value || '').trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        await Linking.openURL(url);
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Documento',
          text2: 'No se pudo abrir el documento.',
        });
      }
      return;
    }

    presentPremiumDataPanel({
      title: 'Documento',
      body: url || 'No hay documento disponible.',
      icon: 'file-document-outline',
      copyText: url || undefined,
      actions: [{ label: 'Cerrar', variant: 'secondary', onPress: dismissPremiumDataPanel }],
    });
  },

  async ActionImage({
    value,
    closeModal,
    uploadCallback,
  }: {
    value: string;
    closeModal?: () => void;
    uploadCallback?: () => Promise<void>;
  }) {
    closeModal?.();

    if (uploadCallback) {
      setTimeout(() => {
        uploadCallback().catch(() => {});
      }, 0);
      return;
    }

    if (__DEV__) {
      console.log('No uploadCallback provided for ActionImage:', value);
    }
  },
};
