import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth } from '@/services/firebaseConfig';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { trEsEn, useLanguage, type AppLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { listMyBusinessCards } from '@/services/businessCardsRepo';
import { listSmartCardsFromDb } from '@/services/qrApi';
import {
  linkNfcCard,
  listMyNfcCards,
  mountNfcCard,
  updateNfcCardStatus,
} from '@/services/nfcCardsRepo';
import type { NfcCardDoc, NfcCardStatus, NfcMountOption } from '@/services/types/nfc';
import { requestSubscriptionPhysicalCardsSection } from '@/services/subscriptionNavigationIntent';
import palette from './theme';

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function statusMeta(status: NfcCardStatus): {
  labelEs: string;
  labelEn: string;
  tone: 'good' | 'muted' | 'warn' | 'danger';
  icon: MaterialIconName;
} {
  if (status === 'active') {
    return { labelEs: 'Activa', labelEn: 'Active', tone: 'good', icon: 'check-circle-outline' };
  }
  if (status === 'paused') {
    return { labelEs: 'Pausada', labelEn: 'Paused', tone: 'muted', icon: 'pause-circle-outline' };
  }
  if (status === 'lost') {
    return { labelEs: 'Perdida', labelEn: 'Lost', tone: 'warn', icon: 'shield-alert-outline' };
  }
  if (status === 'blocked') {
    return { labelEs: 'Bloqueada', labelEn: 'Blocked', tone: 'danger', icon: 'lock-alert-outline' };
  }
  return { labelEs: 'Sin vincular', labelEn: 'Unclaimed', tone: 'muted', icon: 'link-off' };
}

function materialLabel(material: NfcCardDoc['material'], tr: (es: string, en: string) => string): string {
  if (material === 'metal') return tr('Metal', 'Metal');
  if (material === 'wood') return tr('Madera', 'Wood');
  if (material === 'plastic_matte') return tr('Plástico mate', 'Matte plastic');
  return tr('Material no definido', 'Unknown material');
}

function formatIsoForUi(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

/** Tabla NFC explícita: alemán va por `trEsEn` + `de.fragment` (mismo patrón que EN). */
type NfcExtraLanguage = 'fr' | 'it' | 'pt';

const NFC_TRANSLATIONS: Record<string, Record<NfcExtraLanguage, string>> = {
  Activa: { fr: 'Active', it: 'Attiva', pt: 'Ativa' },
  Pausada: { fr: 'En pause', it: 'In pausa', pt: 'Pausada' },
  Perdida: { fr: 'Perdue', it: 'Smarrita', pt: 'Perdida' },
  Bloqueada: { fr: 'Bloquée', it: 'Bloccata', pt: 'Bloqueada' },
  'Sin vincular': { fr: 'Non liée', it: 'Non collegata', pt: 'Não vinculada' },
  Metal: { fr: 'Métal', it: 'Metallo', pt: 'Metal' },
  Madera: { fr: 'Bois', it: 'Legno', pt: 'Madeira' },
  'Plástico mate': { fr: 'Plastique mat', it: 'Plastica opaca', pt: 'Plástico fosco' },
  'Material no definido': { fr: 'Matériau non défini', it: 'Materiale non definito', pt: 'Material não definido' },
  Permanente: { fr: 'Permanent', it: 'Permanente', pt: 'Permanente' },
  'Temporal - 24h': { fr: 'Temporaire - 24 h', it: 'Temporanea - 24 h', pt: 'Temporário - 24h' },
  pendiente: { fr: 'en attente', it: 'in attesa', pt: 'pendente' },
  'mismo destino': { fr: 'même destination', it: 'stessa destinazione', pt: 'mesmo destino' },
  'No se pudo cargar NFC': { fr: 'Impossible de charger NFC', it: 'Impossibile caricare NFC', pt: 'Não foi possível carregar NFC' },
  'Intenta nuevamente.': { fr: 'Réessaie.', it: 'Riprova.', pt: 'Tente novamente.' },
  'ID requerido': { fr: 'ID requis', it: 'ID richiesto', pt: 'ID obrigatório' },
  'Escanea o escribe el identificador NFC.': { fr: "Scanne ou saisis l'identifiant NFC.", it: "Scansiona o digita l'identificativo NFC.", pt: 'Escaneie ou digite o identificador NFC.' },
  'PIN requerido': { fr: 'PIN requis', it: 'PIN richiesto', pt: 'PIN obrigatório' },
  'Escribe el PIN de activación impreso con tu tarjeta.': { fr: "Saisis le PIN d'activation imprimé avec ta carte.", it: 'Inserisci il PIN di attivazione stampato con la tua carta.', pt: 'Digite o PIN de ativação impresso com o seu cartão.' },
  'Tarjeta vinculada': { fr: 'Carte liée', it: 'Carta collegata', pt: 'Cartão vinculado' },
  'Ahora puedes montar una identidad.': { fr: 'Tu peux maintenant monter une identité.', it: "Ora puoi montare un'identità.", pt: 'Agora você pode montar uma identidade.' },
  'No se pudo vincular': { fr: 'Impossible de lier', it: 'Impossibile collegare', pt: 'Não foi possível vincular' },
  'Sin destino': { fr: 'Aucune destination', it: 'Nessuna destinazione', pt: 'Sem destino' },
  'Esta tarjeta aún no tiene identidad montada.': { fr: "Cette carte n'a pas encore d'identité montée.", it: "Questa carta non ha ancora un'identità montata.", pt: 'Este cartão ainda não tem uma identidade montada.' },
  'No se pudo abrir': { fr: "Impossible d'ouvrir", it: 'Impossibile aprire', pt: 'Não foi possível abrir' },
  'Fallback requerido': { fr: 'Fallback requis', it: 'Fallback richiesto', pt: 'Fallback obrigatório' },
  'Crea o selecciona una BusinessCard permanente antes de montar una SmartCard 24 h.': { fr: 'Crée ou sélectionne une BusinessCard permanente avant de monter une SmartCard 24 h.', it: 'Crea o seleziona una BusinessCard permanente prima di montare una SmartCard 24 h.', pt: 'Crie ou selecione uma BusinessCard permanente antes de montar uma SmartCard 24h.' },
  'Crea una BusinessCard permanente antes de montar una SmartCard 24 h.': { fr: 'Crée une BusinessCard permanente avant de monter une SmartCard 24 h.', it: 'Crea una BusinessCard permanente prima di montare una SmartCard 24 h.', pt: 'Crie uma BusinessCard permanente antes de montar uma SmartCard 24h.' },
  'No se pudo montar': { fr: 'Impossible de monter', it: 'Impossibile montare', pt: 'Não foi possível montar' },
  'No se pudo actualizar': { fr: 'Impossible de mettre à jour', it: 'Impossibile aggiornare', pt: 'Não foi possível atualizar' },
  Volver: { fr: 'Retour', it: 'Indietro', pt: 'Voltar' },
  'Menú NFC': { fr: 'Menu NFC', it: 'Menu NFC', pt: 'Menu NFC' },
  'Hardware inteligente': { fr: 'Matériel intelligent', it: 'Hardware intelligente', pt: 'Hardware inteligente' },
  'Vincula tarjetas físicas y monta la identidad que deben abrir ahora mismo. La tarjeta conserva un enlace fijo; Card-Social cambia el destino.': { fr: "Lie des cartes physiques et monte l'identité qu'elles doivent ouvrir maintenant. La carte garde un lien fixe; Card-Social change la destination.", it: "Collega carte fisiche e monta l'identità che devono aprire in questo momento. La carta mantiene un link fisso; Card-Social cambia la destinazione.", pt: 'Vincule cartões físicos e monte a identidade que eles devem abrir agora. O cartão mantém um link fixo; o Card-Social muda o destino.' },
  'Vincular nueva NFC': { fr: 'Lier une nouvelle NFC', it: 'Collega nuova NFC', pt: 'Vincular novo NFC' },
  'Escanea el QR o ingresa el ID de la tarjeta junto con su PIN de activación.': { fr: "Scanne le QR ou saisis l'ID de la carte avec son PIN d'activation.", it: "Scansiona il QR o inserisci l'ID della carta insieme al PIN di attivazione.", pt: 'Escaneie o QR ou digite o ID do cartão junto com o PIN de ativação.' },
  'Vincular tarjeta física': { fr: 'Lier une carte physique', it: 'Collega carta fisica', pt: 'Vincular cartão físico' },
  'Cargando tarjetas NFC...': { fr: 'Chargement des cartes NFC...', it: 'Caricamento carte NFC...', pt: 'Carregando cartões NFC...' },
  'No hay tarjetas vinculadas': { fr: 'Aucune carte liée', it: 'Nessuna carta collegata', pt: 'Nenhum cartão vinculado' },
  'Vincula la primera tarjeta física usando el ID impreso o el QR de manufactura.': { fr: "Lie la première carte physique avec l'ID imprimé ou le QR de fabrication.", it: "Collega la prima carta fisica usando l'ID stampato o il QR di produzione.", pt: 'Vincule o primeiro cartão físico usando o ID impresso ou o QR de fabricação.' },
  'Montado ahora': { fr: 'Monté maintenant', it: 'Montato ora', pt: 'Montado agora' },
  'Página de recuperación segura': { fr: 'Page de récupération sécurisée', it: 'Pagina di recupero sicura', pt: 'Página de recuperação segura' },
  'Pendiente de confirmación del servidor.': { fr: 'En attente de confirmation du serveur.', it: 'In attesa di conferma del server.', pt: 'Aguardando confirmação do servidor.' },
  Montar: { fr: 'Monter', it: 'Monta', pt: 'Montar' },
  Probar: { fr: 'Tester', it: 'Prova', pt: 'Testar' },
  Activar: { fr: 'Activer', it: 'Attiva', pt: 'Ativar' },
  Pausar: { fr: 'Mettre en pause', it: 'Metti in pausa', pt: 'Pausar' },
  'Backend integrado: /api/nfc administra tarjetas y /n/{nfcCardId} resuelve con redirección temporal.': { fr: 'Backend intégré: /api/nfc gère les cartes et /n/{nfcCardId} résout avec une redirection temporaire.', it: 'Backend integrato: /api/nfc gestisce le carte e /n/{nfcCardId} risolve con reindirizzamento temporaneo.', pt: 'Backend integrado: /api/nfc administra cartões e /n/{nfcCardId} resolve com redirecionamento temporário.' },
  'Pega el ID o la URL /n impresa en la tarjeta y escribe el PIN de activación.': { fr: "Colle l'ID ou l'URL /n imprimée sur la carte et saisis le PIN d'activation.", it: "Incolla l'ID o l'URL /n stampata sulla carta e inserisci il PIN di attivazione.", pt: 'Cole o ID ou a URL /n impressa no cartão e digite o PIN de ativação.' },
  'PIN de activación': { fr: "PIN d'activation", it: 'PIN di attivazione', pt: 'PIN de ativação' },
  'Tarjeta 1': { fr: 'Carte 1', it: 'Carta 1', pt: 'Cartão 1' },
  'Vinculando...': { fr: 'Liaison...', it: 'Collegamento...', pt: 'Vinculando...' },
  Vincular: { fr: 'Lier', it: 'Collega', pt: 'Vincular' },
  Cancelar: { fr: 'Annuler', it: 'Annulla', pt: 'Cancelar' },
  'Montar identidad': { fr: "Monter l'identité", it: "Monta identità", pt: 'Montar identidade' },
  'BusinessCards aparecen primero. Las SmartCards generan URL temporal de 24 h y requieren fallback.': { fr: "Les BusinessCards apparaissent d'abord. Les SmartCards génèrent une URL temporaire de 24 h et exigent un fallback.", it: 'Le BusinessCards appaiono per prime. Le SmartCards generano un URL temporaneo di 24 h e richiedono un fallback.', pt: 'As BusinessCards aparecem primeiro. As SmartCards geram URL temporária de 24h e exigem fallback.' },
  'No hay tarjetas disponibles para montar.': { fr: 'Aucune carte disponible à monter.', it: 'Nessuna carta disponibile da montare.', pt: 'Nenhum cartão disponível para montar.' },
  'BusinessCards permanentes': { fr: 'BusinessCards permanentes', it: 'BusinessCards permanenti', pt: 'BusinessCards permanentes' },
  'SmartCards temporales': { fr: 'SmartCards temporaires', it: 'SmartCards temporanee', pt: 'SmartCards temporários' },
  'Temporal - 24h · requiere fallback permanente': { fr: 'Temporaire - 24 h · fallback permanent requis', it: 'Temporanea - 24 h · fallback permanente richiesto', pt: 'Temporário - 24h · exige fallback permanente' },
  'Elegir fallback': { fr: 'Choisir le fallback', it: 'Scegli fallback', pt: 'Escolher fallback' },
  'Fallback permanente': { fr: 'Fallback permanent', it: 'Fallback permanente', pt: 'Fallback permanente' },
};

function trNfc(es: string, en: string, lang: AppLanguage): string {
  if (lang === 'fr' || lang === 'it' || lang === 'pt') {
    return NFC_TRANSLATIONS[es]?.[lang] || trEsEn(es, en, lang);
  }
  return trEsEn(es, en, lang);
}

function nfcRecoveryRouteText(label: string, lang: AppLanguage): string {
  if (lang === 'es') return `Canal elegido: ${label}. No se expone el perfil completo.`;
  if (lang === 'fr') return `Canal choisi: ${label}. Le profil complet n'est pas exposé.`;
  if (lang === 'it') return `Canale scelto: ${label}. Il profilo completo non viene esposto.`;
  if (lang === 'pt') return `Canal escolhido: ${label}. O perfil completo não é exposto.`;
  return `Selected channel: ${label}. Full profile is not exposed.`;
}

function nfcTemporaryTargetText(expiresAt: string | null | undefined, fallbackName: string, lang: AppLanguage): string {
  const expires = expiresAt || (lang === 'es' ? 'Expiración pendiente' : lang === 'fr' ? 'Expiration en attente' : lang === 'it' ? 'Scadenza in attesa' : lang === 'pt' ? 'Expiração pendente' : 'Expiration pending');
  if (lang === 'es') return `${expires}. Fallback obligatorio: ${fallbackName}.`;
  if (lang === 'fr') return `${expires}. Fallback obligatoire: ${fallbackName}.`;
  if (lang === 'it') return `${expires}. Fallback obbligatorio: ${fallbackName}.`;
  if (lang === 'pt') return `${expires}. Fallback obrigatório: ${fallbackName}.`;
  return `${expires}. Required fallback: ${fallbackName}.`;
}

function nfcPermanentTargetText(fallbackName: string, lang: AppLanguage): string {
  if (lang === 'es') return `Destino permanente. Fallback: ${fallbackName}.`;
  if (lang === 'fr') return `Destination permanente. Fallback: ${fallbackName}.`;
  if (lang === 'it') return `Destinazione permanente. Fallback: ${fallbackName}.`;
  if (lang === 'pt') return `Destino permanente. Fallback: ${fallbackName}.`;
  return `Permanent destination. Fallback: ${fallbackName}.`;
}

function nfcServerConfirmedText(value: string, lang: AppLanguage): string {
  if (lang === 'es') return `Confirmado por servidor: ${value}`;
  if (lang === 'fr') return `Confirmé par le serveur: ${value}`;
  if (lang === 'it') return `Confermato dal server: ${value}`;
  if (lang === 'pt') return `Confirmado pelo servidor: ${value}`;
  return `Server confirmed: ${value}`;
}

function nfcLastScanText(value: string, lang: AppLanguage): string {
  if (lang === 'es') return `Último escaneo: ${value}`;
  if (lang === 'fr') return `Dernier scan: ${value}`;
  if (lang === 'it') return `Ultima scansione: ${value}`;
  if (lang === 'pt') return `Último escaneamento: ${value}`;
  return `Last scan: ${value}`;
}

function nfcSmartFallbackPrompt(name: string, lang: AppLanguage): string {
  if (lang === 'es') return `La SmartCard "${name}" expira en 24 h. Elige una BusinessCard permanente para cuando venza.`;
  if (lang === 'fr') return `La SmartCard "${name}" expire dans 24 h. Choisis une BusinessCard permanente pour son expiration.`;
  if (lang === 'it') return `La SmartCard "${name}" scade tra 24 h. Scegli una BusinessCard permanente per quando scadrà.`;
  if (lang === 'pt') return `A SmartCard "${name}" expira em 24h. Escolha uma BusinessCard permanente para quando vencer.`;
  return `The SmartCard "${name}" expires in 24h. Choose a permanent BusinessCard for when it expires.`;
}

export default function NfcScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const headerOnBanner = '#FFFFFF';
  const headerOnBannerMuted = 'rgba(255,255,255,0.78)';
  const headerBackButtonBg = 'rgba(255,255,255,0.14)';
  const headerBackButtonBorder = 'rgba(255,255,255,0.18)';
  const tr = useCallback((es: string, en: string) => trNfc(es, en, language), [language]);
  const [cards, setCards] = useState<NfcCardDoc[]>([]);
  const [mountOptions, setMountOptions] = useState<NfcMountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [mountModalCard, setMountModalCard] = useState<NfcCardDoc | null>(null);
  const [pendingSmartMount, setPendingSmartMount] = useState<{ card: NfcCardDoc; option: NfcMountOption } | null>(null);
  const [newNfcId, setNewNfcId] = useState('');
  const [newActivationPin, setNewActivationPin] = useState('');
  const [newNfcLabel, setNewNfcLabel] = useState('Tarjeta 1');

  const uid = auth.currentUser?.uid || '';

  const replaceCard = useCallback((next: NfcCardDoc) => {
    setCards((prev) => {
      const exists = prev.some((row) => row.nfcCardId === next.nfcCardId);
      if (!exists) return [next, ...prev];
      return prev.map((row) => (row.nfcCardId === next.nfcCardId ? next : row));
    });
  }, []);

  const businessMountOptions = useMemo(
    () => mountOptions.filter((row) => row.type === 'businessCard'),
    [mountOptions],
  );

  const smartMountOptions = useMemo(
    () => mountOptions.filter((row) => row.type === 'smartCard'),
    [mountOptions],
  );

  const loadNfc = useCallback(async () => {
    if (!uid) {
      setCards([]);
      setMountOptions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [nextCards, businessCards, smartCardsResult] = await Promise.all([
        listMyNfcCards(uid),
        listMyBusinessCards(uid),
        listSmartCardsFromDb({ uid }),
      ]);
      const businessOptions: NfcMountOption[] = businessCards.map((card) => ({
        type: 'businessCard',
        id: card.bId,
        displayName: card.bcName || 'Business Card',
        subtitle: card.bcContactName || tr('Permanente', 'Permanent'),
        isTemporary: false,
        expiresInLabel: null,
      }));
      const smartOptions: NfcMountOption[] = smartCardsResult.cards
        .filter((card) => (card.cardType || 'smart') !== 'business' && card.sid)
        .map((card) => ({
          type: 'smartCard',
          id: String(card.sid || ''),
          displayName: card.scName || card.ownerDisplayName || card.sid || 'SmartCard',
          subtitle: tr('Temporal - 24h', 'Temporary - 24h'),
          isTemporary: true,
          expiresInLabel: '24h',
        }));
      setCards(nextCards);
      setMountOptions([...businessOptions, ...smartOptions]);
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo cargar NFC', 'Could not load NFC'),
        userFacingAlertMessage(error, language, tr('Intenta nuevamente.', 'Try again.')),
      );
    } finally {
      setLoading(false);
    }
  }, [tr, uid]);

  useEffect(() => {
    void loadNfc();
  }, [loadNfc]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: shell.backgroundSolid,
        },
        header: {
          paddingTop: insets.top + 12,
          paddingHorizontal: 18,
          paddingBottom: 18,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.modalBorder,
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        },
        backButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: headerBackButtonBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: headerBackButtonBorder,
        },
        headerCopy: {
          flex: 1,
        },
        eyebrow: {
          color: shell.ctaAccent,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 4,
        },
        title: {
          color: headerOnBanner,
          fontSize: 24,
          fontWeight: '800',
          letterSpacing: 0.2,
        },
        subtitle: {
          color: headerOnBannerMuted,
          fontSize: 13,
          lineHeight: 19,
          marginTop: 8,
        },
        body: {
          padding: 18,
          paddingBottom: 38 + insets.bottom,
          gap: 14,
        },
        heroCard: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.surface,
          overflow: 'hidden',
        },
        physicalUpsell: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 2,
          borderColor: shell.ctaAccent,
          backgroundColor: shell.surface,
        },
        physicalUpsellTitle: {
          color: shell.textPrimary,
          fontSize: 17,
          fontWeight: '800',
          marginBottom: 6,
        },
        physicalUpsellText: {
          color: shell.textSecondary,
          fontSize: 13,
          lineHeight: 19,
        },
        physicalUpsellBtn: {
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 13,
          alignItems: 'center',
          backgroundColor: shell.ctaAccent,
        },
        physicalUpsellBtnText: {
          color: shell.emptyCtaText,
          fontSize: 14,
          fontWeight: '800',
        },
        heroTitle: {
          color: shell.textPrimary,
          fontSize: 16,
          fontWeight: '800',
          marginBottom: 6,
        },
        heroText: {
          color: shell.textSecondary,
          fontSize: 13,
          lineHeight: 19,
        },
        input: {
          borderRadius: 14,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.inputBg,
          color: shell.inputText,
          paddingHorizontal: 12,
          paddingVertical: 11,
          fontSize: 14,
          marginTop: 10,
        },
        primaryBtn: {
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 13,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: shell.ctaAccent,
        },
        primaryBtnText: {
          color: shell.emptyCtaText,
          fontSize: 14,
          fontWeight: '800',
        },
        card: {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.modalBg,
          padding: 14,
          gap: 12,
        },
        cardTop: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
        cardIcon: {
          width: 48,
          height: 48,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: shell.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
        },
        cardIdentity: {
          flex: 1,
          minWidth: 0,
        },
        cardTitle: {
          color: shell.textPrimary,
          fontSize: 16,
          fontWeight: '800',
        },
        cardMeta: {
          color: shell.textSecondary,
          fontSize: 12,
          marginTop: 3,
        },
        statusPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderWidth: StyleSheet.hairlineWidth,
        },
        statusText: {
          fontSize: 11,
          fontWeight: '800',
        },
        routeBox: {
          borderRadius: 16,
          padding: 12,
          backgroundColor: shell.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
          gap: 8,
        },
        label: {
          color: shell.ctaAccent,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        routeTitle: {
          color: shell.textPrimary,
          fontSize: 14,
          fontWeight: '800',
        },
        routeText: {
          color: shell.textSecondary,
          fontSize: 12,
          lineHeight: 18,
        },
        actions: {
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
        },
        secondaryBtn: {
          flexGrow: 1,
          minWidth: '30%',
          borderRadius: 13,
          borderWidth: 1,
          borderColor: shell.border,
          paddingVertical: 10,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: shell.surface,
        },
        secondaryBtnText: {
          color: shell.textPrimary,
          fontSize: 12,
          fontWeight: '800',
        },
        footnote: {
          color: shell.textMuted,
          fontSize: 11,
          lineHeight: 16,
          textAlign: 'center',
          marginTop: 4,
        },
        emptyBox: {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surface,
          padding: 18,
          alignItems: 'center',
          gap: 10,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: shell.overlayScrim,
          justifyContent: 'flex-end',
        },
        modalCard: {
          backgroundColor: shell.modalBg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          padding: 16,
          paddingBottom: 20 + insets.bottom,
          maxHeight: '82%',
        },
        modalTitle: {
          color: shell.modalTitle,
          fontSize: 18,
          fontWeight: '800',
          marginBottom: 4,
        },
        optionRow: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surface,
          padding: 12,
          marginTop: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        optionTextCol: {
          flex: 1,
          minWidth: 0,
        },
      }),
    [headerBackButtonBg, headerBackButtonBorder, headerOnBanner, headerOnBannerMuted, insets.bottom, insets.top, shell],
  );

  const toneColors: Record<'good' | 'muted' | 'warn' | 'danger', { fg: string; bg: string; border: string }> = {
    good: { fg: shell.success, bg: `${shell.success}22`, border: `${shell.success}55` },
    muted: { fg: shell.textSecondary, bg: `${shell.textSecondary}18`, border: shell.border },
    warn: { fg: shell.ctaAccent, bg: `${shell.ctaAccent}22`, border: `${shell.ctaAccent}55` },
    danger: { fg: shell.danger, bg: `${shell.danger}22`, border: `${shell.danger}55` },
  };

  const submitLinkCard = async () => {
    if (!uid) return;
    const nfcCardId = newNfcId.trim();
    if (!nfcCardId) {
      Alert.alert(tr('ID requerido', 'ID required'), tr('Escanea o escribe el identificador NFC.', 'Scan or type the NFC identifier.'));
      return;
    }
    const activationPin = newActivationPin.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(activationPin)) {
      Alert.alert(tr('PIN requerido', 'PIN required'), tr('Escribe el PIN de activación impreso con tu tarjeta.', 'Enter the activation PIN printed with your card.'));
      return;
    }
    try {
      setBusyCardId('__link__');
      const card = await linkNfcCard(uid, {
        nfcCardId,
        activationPin,
        label: newNfcLabel.trim() || 'Tarjeta NFC',
        material: 'unknown',
      });
      replaceCard(card);
      setLinkModalOpen(false);
      setNewNfcId('');
      setNewActivationPin('');
      Alert.alert(tr('Tarjeta vinculada', 'Card linked'), tr('Ahora puedes montar una identidad.', 'Now you can mount an identity.'));
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo vincular', 'Could not link'),
        userFacingAlertMessage(error, language, tr('Intenta nuevamente.', 'Try again.')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  const openMountedUrl = async (card: NfcCardDoc) => {
    const url = card.status === 'lost' ? `https://cardsocial.me/n/${encodeURIComponent(card.nfcCardId)}` : card.mountedTarget?.publicUrl;
    if (!url) {
      Alert.alert(tr('Sin destino', 'No destination'), tr('Esta tarjeta aún no tiene identidad montada.', 'This card has no mounted identity yet.'));
      return;
    }
    await Linking.openURL(url).catch(() => {
      Alert.alert(tr('No se pudo abrir', 'Could not open'), url);
    });
  };

  const mountSelectedOption = async (card: NfcCardDoc, option: NfcMountOption, fallback: NfcMountOption) => {
    if (!uid) return;
    if (fallback.type !== 'businessCard') {
      Alert.alert(
        tr('Fallback requerido', 'Fallback required'),
        tr('Crea o selecciona una BusinessCard permanente antes de montar una SmartCard 24 h.', 'Create or select a permanent BusinessCard before mounting a 24h SmartCard.'),
      );
      return;
    }
    try {
      setBusyCardId(card.nfcCardId);
      const next = await mountNfcCard(uid, card.nfcCardId, {
        targetType: option.type,
        targetId: option.id,
        fallbackTargetType: 'businessCard',
        fallbackTargetId: fallback.id,
        fallbackPublicUrl: null,
        fallbackDisplayName: fallback.displayName,
      });
      replaceCard(next);
      setMountModalCard(null);
      setPendingSmartMount(null);
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo montar', 'Could not mount'),
        userFacingAlertMessage(error, language, tr('Intenta nuevamente.', 'Try again.')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  const chooseMountOption = async (card: NfcCardDoc, option: NfcMountOption) => {
    if (option.isTemporary) {
      if (businessMountOptions.length === 0) {
        Alert.alert(
          tr('Fallback requerido', 'Fallback required'),
          tr('Crea una BusinessCard permanente antes de montar una SmartCard 24 h.', 'Create a permanent BusinessCard before mounting a 24h SmartCard.'),
        );
        return;
      }
      setPendingSmartMount({ card, option });
      setMountModalCard(null);
      return;
    }
    await mountSelectedOption(card, option, option);
  };

  const setCardStatus = async (card: NfcCardDoc, status: 'active' | 'paused' | 'lost') => {
    if (!uid) return;
    try {
      setBusyCardId(card.nfcCardId);
      const next = await updateNfcCardStatus(uid, card.nfcCardId, {
        status,
        recoveryContact: status === 'lost'
          ? (card.recoveryContact || {
              iconDataId: 'manual-recovery',
              label: 'Email',
              type: 'email',
              value: auth.currentUser?.email || 'support@cardsocial.me',
            })
          : undefined,
      });
      replaceCard(next);
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo actualizar', 'Could not update'),
        userFacingAlertMessage(error, language, tr('Intenta nuevamente.', 'Try again.')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...shell.vipBannerGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr('Volver', 'Back')}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={headerOnBanner} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{tr('Menú NFC', 'NFC Menu')}</Text>
            <Text style={styles.title}>{tr('Hardware inteligente', 'Smart hardware')}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {tr(
            'Vincula tarjetas físicas y monta la identidad que deben abrir ahora mismo. La tarjeta conserva un enlace fijo; Card-Social cambia el destino.',
            'Link physical cards and mount the identity they should open right now. The card keeps one fixed link; Card-Social changes the destination.',
          )}
        </Text>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        <View style={styles.physicalUpsell}>
          <Text style={styles.physicalUpsellTitle}>
            {tr('Compra tarjetas físicas NFC', 'Buy NFC physical cards')}
          </Text>
          <Text style={styles.physicalUpsellText}>
            {tr(
              'Abre Suscripción en el menú para ver precios de PVC y metal, slots extra y la licencia de negocio.',
              'Open Subscription from the menu to see PVC and metal pricing, extra slots, and the business license.',
            )}
          </Text>
          <TouchableOpacity
            style={styles.physicalUpsellBtn}
            onPress={() => {
              router.back();
              requestSubscriptionPhysicalCardsSection({ delayMs: 380 });
            }}
            accessibilityRole="button"
            accessibilityLabel={tr('Ir a comprar tarjetas físicas', 'Shop physical cards')}
          >
            <Text style={styles.physicalUpsellBtnText}>
              {tr('Ir a comprar tarjetas físicas', 'Shop physical cards')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{tr('Vincular nueva NFC', 'Link new NFC')}</Text>
          <Text style={styles.heroText}>
            {tr(
                'Escanea el QR o ingresa el ID de la tarjeta junto con su PIN de activación.',
                'Scan the QR or enter the card ID together with its activation PIN.',
            )}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setLinkModalOpen(true)} accessibilityRole="button">
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={shell.emptyCtaText} />
            <Text style={styles.primaryBtnText}>{tr('Vincular tarjeta física', 'Link physical card')}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={shell.ctaAccent} />
            <Text style={styles.heroText}>{tr('Cargando tarjetas NFC...', 'Loading NFC cards...')}</Text>
          </View>
        ) : cards.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="contactless-payment-circle-outline" size={42} color={shell.ctaAccent} />
            <Text style={styles.heroTitle}>{tr('No hay tarjetas vinculadas', 'No linked cards')}</Text>
            <Text style={[styles.heroText, { textAlign: 'center' }]}>
              {tr(
                'Vincula la primera tarjeta física usando el ID impreso o el QR de manufactura.',
                'Link the first physical card using the printed ID or manufacturing QR.',
              )}
            </Text>
          </View>
        ) : null}

        {cards.map((card) => {
          const meta = statusMeta(card.status);
          const tone = toneColors[meta.tone];
          const busy = busyCardId === card.nfcCardId;
          return (
            <View key={card.nfcCardId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons name="contactless-payment-circle-outline" size={28} color={shell.ctaAccent} />
                </View>
                <View style={styles.cardIdentity}>
                  <Text style={styles.cardTitle}>{card.label}</Text>
                  <Text style={styles.cardMeta}>
                    {materialLabel(card.material, tr)} · /n/{card.nfcCardId}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <MaterialCommunityIcons name={meta.icon} size={13} color={tone.fg} />
                  <Text style={[styles.statusText, { color: tone.fg }]}>{tr(meta.labelEs, meta.labelEn)}</Text>
                </View>
              </View>

              <View style={styles.routeBox}>
                <Text style={styles.label}>{tr('Montado ahora', 'Mounted now')}</Text>
                <Text style={styles.routeTitle}>
                  {card.status === 'lost'
                    ? tr('Página de recuperación segura', 'Secure recovery page')
                    : card.mountedTarget?.displayName || tr('Sin destino', 'No destination')}
                </Text>
                <Text style={styles.routeText}>
                  {card.status === 'lost'
                    ? nfcRecoveryRouteText(card.recoveryContact?.label || tr('pendiente', 'pending'), language)
                    : card.mountedTarget?.isTemporary
                      ? nfcTemporaryTargetText(card.mountedTarget.expiresAt, card.fallbackTarget?.displayName || tr('pendiente', 'pending'), language)
                      : nfcPermanentTargetText(card.fallbackTarget?.displayName || tr('mismo destino', 'same destination'), language)}
                </Text>
                <Text style={styles.routeText}>
                  {formatIsoForUi(card.lastConfirmedAt)
                    ? nfcServerConfirmedText(formatIsoForUi(card.lastConfirmedAt) || '', language)
                    : tr('Pendiente de confirmación del servidor.', 'Pending server confirmation.')}
                </Text>
                {formatIsoForUi(card.lastResolvedAt) ? (
                  <Text style={styles.routeText}>
                    {nfcLastScanText(formatIsoForUi(card.lastResolvedAt) || '', language)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(card)} accessibilityRole="button" disabled={busy}>
                  <MaterialCommunityIcons name="swap-horizontal" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{tr('Montar', 'Mount')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => openMountedUrl(card)} accessibilityRole="button">
                  <MaterialCommunityIcons name="open-in-new" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{tr('Probar', 'Test')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'lost' ? 'active' : 'lost')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name="shield-alert-outline" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'lost' ? tr('Activar', 'Activate') : tr('Perdida', 'Lost')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'paused' ? 'active' : 'paused')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name={card.status === 'paused' ? 'play-circle-outline' : 'pause-circle-outline'} size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'paused' ? tr('Activar', 'Activate') : tr('Pausar', 'Pause')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>
          {tr(
            'Backend integrado: /api/nfc administra tarjetas y /n/{nfcCardId} resuelve con redirección temporal.',
            'Backend integrated: /api/nfc manages cards and /n/{nfcCardId} resolves with temporary redirects.',
          )}
        </Text>
      </ScrollView>

      <Modal visible={linkModalOpen} transparent animationType="slide" onRequestClose={() => setLinkModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tr('Vincular tarjeta física', 'Link physical card')}</Text>
            <Text style={styles.heroText}>
              {tr('Pega el ID o la URL /n impresa en la tarjeta y escribe el PIN de activación.', 'Paste the ID or /n URL printed on the card and enter the activation PIN.')}
            </Text>
            <TextInput
              style={styles.input}
              value={newNfcId}
              onChangeText={setNewNfcId}
              placeholder="nfc-metal-001"
              placeholderTextColor={shell.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={newActivationPin}
              onChangeText={(v) => setNewActivationPin(v.toUpperCase())}
              placeholder={tr('PIN de activación', 'Activation PIN')}
              placeholderTextColor={shell.textMuted}
              autoCapitalize="characters"
              maxLength={12}
            />
            <TextInput
              style={styles.input}
              value={newNfcLabel}
              onChangeText={setNewNfcLabel}
              placeholder={tr('Tarjeta 1', 'Card 1')}
              placeholderTextColor={shell.textMuted}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={submitLinkCard} disabled={busyCardId === '__link__'}>
              <Text style={styles.primaryBtnText}>
                {busyCardId === '__link__' ? tr('Vinculando...', 'Linking...') : tr('Vincular', 'Link')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setLinkModalOpen(false)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(mountModalCard)} transparent animationType="slide" onRequestClose={() => setMountModalCard(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tr('Montar identidad', 'Mount identity')}</Text>
            <Text style={styles.heroText}>
              {tr('BusinessCards aparecen primero. Las SmartCards generan URL temporal de 24 h y requieren fallback.', 'BusinessCards appear first. SmartCards generate a 24h temporary URL and require fallback.')}
            </Text>
            <ScrollView style={{ marginTop: 6 }}>
              {mountOptions.length === 0 ? (
                <Text style={[styles.heroText, { marginTop: 14 }]}>
                  {tr('No hay tarjetas disponibles para montar.', 'No cards available to mount.')}
                </Text>
              ) : (
                <>
                  {businessMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 10 }]}>{tr('BusinessCards permanentes', 'Permanent BusinessCards')}</Text>
                  ) : null}
                  {businessMountOptions.map((option) => (
                    <TouchableOpacity
                      key={`${option.type}:${option.id}`}
                      style={styles.optionRow}
                      onPress={() => mountModalCard && chooseMountOption(mountModalCard, option)}
                      disabled={Boolean(busyCardId)}
                    >
                      <MaterialCommunityIcons name="briefcase-outline" size={22} color={shell.ctaAccent} />
                      <View style={styles.optionTextCol}>
                        <Text style={styles.routeTitle}>{option.displayName}</Text>
                        <Text style={styles.routeText}>{option.subtitle || tr('Permanente', 'Permanent')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}

                  {smartMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 14 }]}>{tr('SmartCards temporales', 'Temporary SmartCards')}</Text>
                  ) : null}
                  {smartMountOptions.map((option) => (
                    <TouchableOpacity
                      key={`${option.type}:${option.id}`}
                      style={styles.optionRow}
                      onPress={() => mountModalCard && chooseMountOption(mountModalCard, option)}
                      disabled={Boolean(busyCardId)}
                    >
                      <MaterialCommunityIcons name="card-account-details-outline" size={22} color={shell.ctaAccent} />
                      <View style={styles.optionTextCol}>
                        <Text style={styles.routeTitle}>{option.displayName}</Text>
                        <Text style={styles.routeText}>
                          {tr('Temporal - 24h · requiere fallback permanente', 'Temporary - 24h · permanent fallback required')}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(null)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pendingSmartMount)}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingSmartMount(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tr('Elegir fallback', 'Choose fallback')}</Text>
            <Text style={styles.heroText}>
              {pendingSmartMount
                ? nfcSmartFallbackPrompt(pendingSmartMount.option.displayName, language)
                : null}
            </Text>
            <ScrollView style={{ marginTop: 6 }}>
              {businessMountOptions.map((fallback) => (
                <TouchableOpacity
                  key={`fallback:${fallback.id}`}
                  style={styles.optionRow}
                  onPress={() => pendingSmartMount && mountSelectedOption(pendingSmartMount.card, pendingSmartMount.option, fallback)}
                  disabled={Boolean(busyCardId)}
                >
                  <MaterialCommunityIcons name="shield-check-outline" size={22} color={shell.ctaAccent} />
                  <View style={styles.optionTextCol}>
                    <Text style={styles.routeTitle}>{fallback.displayName}</Text>
                    <Text style={styles.routeText}>{tr('Fallback permanente', 'Permanent fallback')}</Text>
                  </View>
                  <MaterialCommunityIcons name="check" size={20} color={shell.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPendingSmartMount(null)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
