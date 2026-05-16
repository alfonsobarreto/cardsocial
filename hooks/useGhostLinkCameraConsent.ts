import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';

import { getActiveUserId } from '@/services/authSession';
import type { AppLanguage } from '@/services/coreI18n';
import { coreT } from '@/services/coreI18n';
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
  lang: AppLanguage;
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
  lang,
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
            coreT('voip_camera_consent_title', lang),
            coreT('voip_camera_consent_body', lang),
            [
              {
                text: coreT('voip_camera_deny', lang),
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
                text: coreT('voip_camera_allow', lang),
                onPress: () => {
                  void (async () => {
                    const ok = await ensureVoipPermissions('video');
                    if (!ok) {
                      Toast.show({
                        type: 'info',
                        text1: coreT('voip_camera_permission_short_title', lang),
                        text2: coreT('voip_camera_permission_required', lang),
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
              text1: coreT('voip_camera_peer_declined_title', lang),
              text2: coreT('voip_camera_peer_declined_body', lang),
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
  }, [sessionId, handshakeActive, callType, setVideoEnabled, lang]);

  const toggleVideoWithConsent = useCallback(async () => {
    if (callType === 'video') {
      setVideoEnabled((p) => !p);
      return;
    }

    if (!handshakeActive) {
      Toast.show({
        type: 'info',
        text1: coreT('voip_camera_wait_connect_title', lang),
        text2: coreT('voip_camera_wait_connect_body', lang),
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
      text1: coreT('voip_camera_waiting_title', lang),
      text2: coreT('voip_camera_waiting_body', lang),
    });
  }, [callType, handshakeActive, sessionId, videoEnabled, setVideoEnabled, lang]);

  return { toggleVideoWithConsent, videoUpgradeWaiting: waitingPeer };
}
