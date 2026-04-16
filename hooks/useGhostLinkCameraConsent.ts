import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';

import { getActiveUserId } from '@/services/authSession';
import {
  clearGhostLinkCameraSignal,
  watchGhostLinkCameraSignal,
  writeGhostLinkCameraRequest,
  writeGhostLinkCameraResponse,
} from '@/services/ghostLinkVoipCameraSignal';
import { ensureVoipPermissions } from '@/services/voip/ensureVoipPermissions';
import type { GhostLinkCallType } from '@/services/ghostLinkVoip';

type Params = {
  sessionId: string | null | undefined;
  /** Solo en fase conectada: evita pedir cámara durante el timbre. */
  handshakeActive: boolean;
  callType: GhostLinkCallType;
  videoEnabled: boolean;
  setVideoEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tr: (es: string, en: string) => string;
};

/**
 * Audio → vídeo: el otro usuario debe aceptar vía Firestore antes de encender publicación.
 * Llamadas que ya son `video` alternan cámara local sin este paso.
 */
export function useGhostLinkCameraConsent({
  sessionId,
  handshakeActive,
  callType,
  videoEnabled,
  setVideoEnabled,
  tr,
}: Params) {
  const [waitingPeer, setWaitingPeer] = useState(false);
  const promptedRef = useRef<string | null>(null);
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    promptedRef.current = null;
    handledResponseRef.current = null;
    setWaitingPeer(false);
  }, [sessionId]);

  useEffect(() => {
    const sid = String(sessionId || '').trim();
    if (!sid || !handshakeActive || callType !== 'audio') {
      return undefined;
    }

    const unsub = watchGhostLinkCameraSignal(sid, (snap) => {
      void (async () => {
        const myUid = await getActiveUserId();
        if (!myUid) return;

        const req = snap.requestBy;
        const res = snap.response;

        if (req && req !== myUid && res == null) {
          const key = `${req}:pending`;
          if (promptedRef.current === key) return;
          promptedRef.current = key;

          Alert.alert(
            tr('Videollamada', 'Video call'),
            tr(
              'Tu contacto quiere activar la cámara. ¿Aceptas?',
              'Your contact wants to turn on the camera. Do you allow it?',
            ),
            [
              {
                text: tr('Denegar', 'Deny'),
                style: 'cancel',
                onPress: () => {
                  void (async () => {
                    await writeGhostLinkCameraResponse(sid, 'deny');
                    await clearGhostLinkCameraSignal(sid);
                    promptedRef.current = null;
                  })();
                },
              },
              {
                text: tr('Aceptar', 'Allow'),
                onPress: () => {
                  void (async () => {
                    const ok = await ensureVoipPermissions('video');
                    if (!ok) {
                      Toast.show({
                        type: 'info',
                        text1: tr('Permisos', 'Permissions'),
                        text2: tr(
                          'Se necesita permiso de cámara.',
                          'Camera permission is required.',
                        ),
                      });
                      await writeGhostLinkCameraResponse(sid, 'deny');
                      await clearGhostLinkCameraSignal(sid);
                      promptedRef.current = null;
                      return;
                    }
                    await writeGhostLinkCameraResponse(sid, 'accept');
                    promptedRef.current = null;
                  })();
                },
              },
            ],
          );
        }

        if (res === 'deny') {
          const k = `${sid}:deny`;
          if (handledResponseRef.current === k) return;
          handledResponseRef.current = k;
          setVideoEnabled(false);
          setWaitingPeer(false);
          if (req === myUid) {
            Toast.show({
              type: 'info',
              text1: tr('Cámara', 'Camera'),
              text2: tr(
                'El contacto rechazó la videollamada.',
                'The contact declined video.',
              ),
            });
          }
          await clearGhostLinkCameraSignal(sid);
        }

        if (res === 'accept') {
          const k = `${sid}:accept`;
          if (handledResponseRef.current === k) return;
          handledResponseRef.current = k;
          setWaitingPeer(false);
          const ok = await ensureVoipPermissions('video');
          if (ok) {
            setVideoEnabled(true);
          }
          await clearGhostLinkCameraSignal(sid);
        }
      })();
    });

    return unsub;
  }, [sessionId, handshakeActive, callType, setVideoEnabled, tr]);

  const toggleVideoWithConsent = useCallback(async () => {
    if (callType === 'video') {
      setVideoEnabled((p) => !p);
      return;
    }

    if (!handshakeActive) {
      Toast.show({
        type: 'info',
        text1: tr('Llamada', 'Call'),
        text2: tr(
          'Espera a que la llamada esté conectada.',
          'Wait until the call is connected.',
        ),
      });
      return;
    }

    const sid = String(sessionId || '').trim();
    if (!sid) return;

    const myUid = await getActiveUserId();
    if (!myUid) return;

    if (videoEnabled) {
      setVideoEnabled(false);
      setWaitingPeer(false);
      await clearGhostLinkCameraSignal(sid);
      return;
    }

    await writeGhostLinkCameraRequest(sid, myUid);
    setWaitingPeer(true);
    Toast.show({
      type: 'info',
      text1: tr('Videollamada', 'Video'),
      text2: tr(
        'Esperando respuesta del contacto…',
        'Waiting for your contact…',
      ),
    });
  }, [callType, handshakeActive, sessionId, videoEnabled, setVideoEnabled, tr]);

  return { toggleVideoWithConsent, videoUpgradeWaiting: waitingPeer };
}
