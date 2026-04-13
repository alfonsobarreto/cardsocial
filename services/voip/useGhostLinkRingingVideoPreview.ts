import { useEffect, useState } from 'react';
import {
  startGhostLinkLocalVideoPreview,
  stopGhostLinkLocalVideoPreview,
} from '@/services/ghostLinkAgoraSession';

export type UseGhostLinkRingingVideoPreviewParams = {
  /** `agora.appId` del backend; sin esto no hay preview. */
  appId: string | undefined;
  /**
   * true solo mientras suena el timbre y aún no pasó el handoff hacia `joinChannel`
   * (`rtcHandoffComplete` en el provider).
   */
  active: boolean;
};

/**
 * Preview local con Agora (`startPreview` sin `join`) durante timbre.
 * Cleanup: `stopPreview` + `release` vía `stopGhostLinkLocalVideoPreview` al desactivar o desmontar.
 */
export function useGhostLinkRingingVideoPreview(
  params: UseGhostLinkRingingVideoPreviewParams,
): { localPreviewActive: boolean } {
  const { appId, active } = params;
  const [localPreviewActive, setLocalPreviewActive] = useState(false);

  useEffect(() => {
    const id = appId?.trim();
    if (!active || !id) {
      setLocalPreviewActive(false);
      void stopGhostLinkLocalVideoPreview();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await startGhostLinkLocalVideoPreview(id);
        if (!cancelled) setLocalPreviewActive(true);
      } catch {
        if (!cancelled) setLocalPreviewActive(false);
      }
    })();

    return () => {
      cancelled = true;
      setLocalPreviewActive(false);
      void stopGhostLinkLocalVideoPreview();
    };
  }, [active, appId]);

  return { localPreviewActive };
}
