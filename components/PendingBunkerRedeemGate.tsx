/**
 * PendingBunkerRedeemGate
 *
 * Runs as a transparent layer in the root layout. On app open or foreground resume:
 *  1. Reads the clipboard via expo-clipboard.
 *  2. If content looks like a temporary-access token (48-char hex string), validates it
 *     against the backend (no JWT needed).
 *  3. If valid, shows BunkerClassificationModal so the user can add the contact to a group.
 *  4. On confirmation: calls consumeDynamicQrToken (which creates share_permission) and
 *     persists the group in AsyncStorage (contacts_meta_v2) so it shows in ContactsPage.
 *
 * The gate is silent and non-blocking — any error is swallowed so it never interrupts
 * normal app flow.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveUserId } from '@/services/authSession';
import { validateTemporaryAccessToken, consumeTemporaryAccessToken } from '@/services/qrApi';
import BunkerClassificationModal from '@/components/BunkerClassificationModal';
import { useLanguage } from '@/services/language';

/** contacts_meta_v2 key must match the one in contacts.tsx */
const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
/** Track already-seen tokens so we don't show the modal twice for the same value */
const SEEN_TOKENS_KEY = '@bunker_seen_tokens_v1';

/** Minimal validation: temporary_access tokens are 48-char hex strings. */
function looksLikeBunkerToken(text: string): boolean {
  const trimmed = text.trim();
  return /^[0-9a-f]{48}$/i.test(trimmed);
}

async function markTokenSeen(token: string) {
  try {
    const raw = await AsyncStorage.getItem(SEEN_TOKENS_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(token)) {
      seen.push(token);
      // Keep only the last 50 tokens
      const capped = seen.slice(-50);
      await AsyncStorage.setItem(SEEN_TOKENS_KEY, JSON.stringify(capped));
    }
  } catch {
    // non-critical
  }
}

async function isTokenSeen(token: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_TOKENS_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    return seen.includes(token);
  } catch {
    return false;
  }
}

type PendingContact = {
  ownerUid: string;
  cardId: string;
  token: string;
  ownerDisplayName: string | null;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  cardName: string;
  holdersCount: number;
  ratingAvg: number;
};

export default function PendingBunkerRedeemGate() {
  const { language } = useLanguage();
  const [pendingContact, setPendingContact] = useState<PendingContact | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const isCheckingRef = useRef(false);

  const checkClipboard = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // Must be logged in to add contacts
      const currentUserId = await getActiveUserId();
      if (!currentUserId) return;

      let clipText = '';
      try {
        clipText = (await Clipboard.getStringAsync()) || '';
      } catch {
        return;
      }

      const trimmed = clipText.trim();
      if (!looksLikeBunkerToken(trimmed)) return;

      // Don't show modal twice for the same token
      const alreadySeen = await isTokenSeen(trimmed);
      if (alreadySeen) return;

      // Validate against the backend
      const result = await validateTemporaryAccessToken({ token: trimmed });
      if (!result.ok) {
        // Mark as seen even if expired so we don't retry forever
        await markTokenSeen(trimmed);
        return;
      }

      await markTokenSeen(trimmed);

      setPendingContact({
        ownerUid: result.ownerUid,
        cardId: result.cardId,
        token: trimmed,
        ownerDisplayName: result.ownerDisplayName,
        ownerNickname: result.ownerNickname,
        ownerPhotoUrl: result.ownerPhotoUrl,
        ownerOccupation: result.ownerOccupation,
        cardName: result.cardName,
        holdersCount: result.holdersCount,
        ratingAvg: result.ratingAvg,
      });
      setModalVisible(true);
    } catch {
      // Silent — never interrupt the user
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  // Run on mount
  useEffect(() => {
    void checkClipboard();
  }, [checkClipboard]);

  // Run on foreground resume
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void checkClipboard();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [checkClipboard]);

  const handleConsumeToken = async (_ownerUid: string, _cardId: string) => {
    const currentUserId = await getActiveUserId();
    if (!currentUserId) throw new Error('Not logged in');

    await consumeTemporaryAccessToken({ receiverUid: currentUserId, token: pendingContact!.token });
  };

  const handleSaved = async (group: string) => {
    if (!pendingContact) return;

    try {
      // Persist group meta in AsyncStorage so ContactsPage picks it up
      const raw = await AsyncStorage.getItem(CONTACT_META_STORAGE_KEY);
      const metaMap: Record<string, { group: string; isFavorite: boolean; firstSeenAt: string }> =
        raw ? JSON.parse(raw) : {};

      metaMap[pendingContact.ownerUid] = {
        group,
        isFavorite: false,
        firstSeenAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(CONTACT_META_STORAGE_KEY, JSON.stringify(metaMap));

      // Clear the clipboard so the gate doesn't trigger again
      try {
        await Clipboard.setStringAsync('');
      } catch {
        // ignore
      }
    } catch {
      // non-critical
    }

    setModalVisible(false);
    setPendingContact(null);
  };

  const handleClose = () => {
    setModalVisible(false);
    setPendingContact(null);
  };

  if (!pendingContact) return null;

  return (
    <BunkerClassificationModal
      visible={modalVisible}
      ownerUid={pendingContact.ownerUid}
      cardId={pendingContact.cardId}
      ownerDisplayName={pendingContact.ownerDisplayName}
      ownerNickname={pendingContact.ownerNickname}
      ownerPhotoUrl={pendingContact.ownerPhotoUrl}
      ownerOccupation={pendingContact.ownerOccupation}
      cardName={pendingContact.cardName}
      holdersCount={pendingContact.holdersCount}
      ratingAvg={pendingContact.ratingAvg}
      language={language as 'es' | 'en'}
      onClose={handleClose}
      onSaved={handleSaved}
      onConsumeToken={handleConsumeToken}
    />
  );
}
