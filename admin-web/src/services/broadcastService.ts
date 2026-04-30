import type { User } from 'firebase/auth';

export type BroadcastPreviewResponse = {
  ok: true;
  segment: string;
  count: number;
  withEmail: number;
  firestoreEnabled: boolean;
  languageHistogram: Record<string, number>;
  sample: { uid: string; email: string | null; language: string }[];
};

export type BroadcastSendResponse = {
  ok: true;
  segment: string;
  channel: string;
  audience: number;
  sentEmail: number;
  failedEmail: number;
  sentPush: number;
  skippedNoEmail: number;
};

export type LangMessage = { subject: string; body: string };

export type BroadcastMessagesPayload = Record<string, LangMessage>;

export type SegmentOption = {
  value: string;
  label: string;
  hint?: string;
  group: 'quick' | 'more';
};

function apiBase(): string {
  const u = String(import.meta.env.VITE_BACKEND_API_URL || '').trim();
  if (!u) throw new Error('VITE_BACKEND_API_URL is not configured');
  return u.replace(/\/+$/, '');
}

function gatewayKey(): string {
  const k =
    String(import.meta.env.VITE_MODERATION_GATEWAY_KEY || '').trim() ||
    String(import.meta.env.VITE_API_GATEWAY_KEY || '').trim();
  if (!k) {
    throw new Error('VITE_MODERATION_GATEWAY_KEY (or VITE_API_GATEWAY_KEY) is not configured');
  }
  return k;
}

async function readErrBody(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    const m = String(j?.error || '').trim();
    if (m) return m;
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

async function adminBearer(firebaseUser: User, scope: 'admin.system' | 'admin.broadcast'): Promise<{
  base: string;
  key: string;
  token: string;
}> {
  const base = apiBase();
  const key = gatewayKey();
  const uid = firebaseUser.uid;
  const tokenRes = await fetch(`${base}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
    },
    body: JSON.stringify({ uid, scope }),
  });
  if (!tokenRes.ok) {
    throw new Error(await readErrBody(tokenRes));
  }
  const tokenJson = (await tokenRes.json()) as { token?: string };
  const token = String(tokenJson?.token || '').trim();
  if (!token) throw new Error('Token exchange returned empty token');
  return { base, key, token };
}

export async function broadcastPreview(
  firebaseUser: User,
  body: { segment: string; days?: number },
): Promise<BroadcastPreviewResponse> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.broadcast');
  const res = await fetch(`${base}/api/admin/broadcast/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrBody(res));
  }
  return res.json() as Promise<BroadcastPreviewResponse>;
}

export async function broadcastSend(
  firebaseUser: User,
  body: {
    segment: string;
    channel: 'email' | 'push' | 'both';
    messages: BroadcastMessagesPayload;
    confirmRecipientCount: number;
    confirmAck: 'BROADCAST_CONFIRM';
    days?: number;
  },
): Promise<BroadcastSendResponse> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.broadcast');
  const res = await fetch(`${base}/api/admin/broadcast/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrBody(res));
  }
  return res.json() as Promise<BroadcastSendResponse>;
}

export const BROADCAST_LANGS = ['es', 'en', 'it', 'fr', 'pt'] as const;

export const LANG_TAB_LABEL: Record<(typeof BROADCAST_LANGS)[number], string> = {
  es: 'ES',
  en: 'EN',
  it: 'IT',
  fr: 'FR',
  pt: 'PT',
};

/** Plantilla sugerida multilenguaje para campañas de bienvenida (editable). */
export const WELCOME_MESSAGE_DRAFT: BroadcastMessagesPayload = {
  es: {
    subject: '¡Bienvenido a Card-Social!',
    body:
      'Gracias por unirte. Ya puedes crear tu tarjeta digital, compartir tu QR y ver el impacto de tu red.\n\n' +
      'Si tienes dudas, responde a este correo o visita cardsocial.me.',
  },
  en: {
    subject: 'Welcome to Card-Social',
    body:
      'Thanks for joining. You can now set up your digital card, share your QR, and track your network impact.\n\n' +
      'Questions? Reply to this email or visit cardsocial.me.',
  },
  it: {
    subject: 'Benvenuto su Card-Social',
    body:
      'Grazie per esserti iscritto. Puoi creare la tua card digitale, condividere il QR e monitorare la tua rete.\n\n' +
      'Visita cardsocial.me per maggiori informazioni.',
  },
  fr: {
    subject: 'Bienvenue sur Card-Social',
    body:
      'Merci de nous avoir rejoints. Créez votre carte numérique, partagez votre QR et suivez votre impact.\n\n' +
      'Visitez cardsocial.me pour en savoir plus.',
  },
  pt: {
    subject: 'Bem-vindo ao Card-Social',
    body:
      'Obrigado por se juntar a nós. Crie seu cartão digital, compartilhe seu QR e acompanhe sua rede.\n\n' +
      'Visite cardsocial.me para mais informações.',
  },
};

export const RENEWAL_7_DRAFT: BroadcastMessagesPayload = {
  es: {
    subject: 'Tu suscripción Card-Social vence pronto',
    body:
      'Renueva en los próximos días para no perder beneficios premium y mantener tu presencia activa.\n\n' +
      'Entra a la app para renovar.',
  },
  en: {
    subject: 'Your Card-Social subscription is expiring soon',
    body:
      'Renew within the next few days to keep your premium benefits and stay active.\n\n' +
      'Open the app to renew.',
  },
  it: {
    subject: 'Il tuo abbonamento Card-Social sta per scadere',
    body: 'Rinnova nei prossimi giorni per mantenere i vantaggi premium. Apri l’app per rinnovare.',
  },
  fr: {
    subject: 'Votre abonnement Card-Social expire bientôt',
    body: 'Renouvelez dans les prochains jours pour conserver vos avantages premium. Ouvrez l’application.',
  },
  pt: {
    subject: 'Sua assinatura Card-Social expira em breve',
    body: 'Renove nos próximos dias para manter os benefícios premium. Abra o aplicativo.',
  },
};

export const BROADCAST_SEGMENT_OPTIONS: SegmentOption[] = [
  {
    group: 'quick',
    value: 'new_users_week',
    label: 'Nuevos de la semana (últimos 7 días)',
    hint: 'Altas en rolling 7 días (Firetore si hay Admin SDK; si no, Mongo).',
  },
  {
    group: 'quick',
    value: 'subscription_30d',
    label: 'Vencen en 30 días (suscripción / premium)',
    hint: 'Mongo subscriptionExpiresAt entre hoy y +30 d.',
  },
  {
    group: 'quick',
    value: 'credit_holders',
    label: 'Saldo CS > 0',
    hint: 'Usuarios con creditsBalance positivo en Mongo.',
  },
  {
    group: 'quick',
    value: 'subscription_expiring_7d',
    label: 'Renovación urgente (suscripción en 7 días)',
    hint: 'Lista rápida desde Mongo: subscriptionExpiresAt en la próxima semana.',
  },
  {
    group: 'more',
    value: 'welcome_monday',
    label: 'Lunes de Bienvenida (sem. ISO anterior)',
    hint: 'Solo altas entre lunes y domingo UTC de la semana pasada.',
  },
  {
    group: 'more',
    value: 'new_users',
    label: 'Nuevos — ventana N días (avanzado)',
    hint: 'Configura N abajo. Para 7 días usa la regla rápida o el botón Lunes.',
  },
  {
    group: 'more',
    value: 'expiring_licenses',
    label: 'Licencias business por vencer (7 d)',
    hint: 'Mongo business_card_licenses.',
  },
  {
    group: 'more',
    value: 'coin_expiry_risk',
    label: 'Riesgo / monedas inactivas',
    hint: 'CS > 0 y sin actividad reciente (6 meses).',
  },
];

export function formatSimulationLine(
  total: number,
  histogram: Record<string, number> | null,
): string {
  if (total === 0) {
    return 'Este mensaje se enviará a 0 personas. Elige una regla y pulsa «Simular audiencia».';
  }
  if (!histogram || Object.keys(histogram).length === 0) {
    return `Este mensaje se enviará a ${total} personas.`;
  }
  const order = [...BROADCAST_LANGS];
  const chunks: string[] = [];
  for (const lang of order) {
    const c = histogram[lang];
    if (c) chunks.push(`${c} en ${LANG_TAB_LABEL[lang]}`);
  }
  for (const [k, v] of Object.entries(histogram)) {
    if (!order.includes(k as (typeof BROADCAST_LANGS)[number]) && v > 0) {
      chunks.push(`${v} en ${k.toUpperCase()}`);
    }
  }
  return `Este mensaje se enviará a ${total} personas (${chunks.join(', ')}).`;
}
