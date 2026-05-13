import type { AppLanguage } from '@/services/language';

export type VerificationSelfieStrings = {
  /** Texto bajo la etiqueta "Selfie de verificación". */
  sectionHelper: string;
  coachTitle: string;
  coachHeadline: string;
  coachBody: string;
  coachTipLight: string;
  coachTipExpression: string;
  coachCta: string;
  coachLater: string;
  invalidTitle: string;
  invalidBody: string;
};

const STRINGS: Record<AppLanguage, VerificationSelfieStrings> = {
  es: {
    sectionHelper:
      'Para pasar la verificación debes mostrar una sonrisa clara o un guiño (un ojo cerrado y el otro abierto). Buena luz y rostro centrado. La app comprueba la expresión en el dispositivo antes de subir.',
    coachTitle: 'Verificación en vivo',
    coachHeadline: 'Sonrisa amplia o guiño claro',
    coachBody:
      'Así comprobamos que hay una persona real detrás de la cámara. Elige una de las dos: una sonrisa bien visible o un guiño marcado.',
    coachTipLight: 'Luz frontal suave; evita contraluz.',
    coachTipExpression: 'Rostro centrado; gafas o pelo no deben cubrir los ojos.',
    coachCta: 'Entendido — abrir cámara',
    coachLater: 'Ahora no',
    invalidTitle: 'Selfie no válida aún',
    invalidBody:
      'Necesitamos una sonrisa clara o un guiño visible. La comprobación en el dispositivo pide al menos ~70 % de confianza. Intenta de nuevo con más luz.',
  },
  en: {
    sectionHelper:
      'To pass verification, show a clear smile or a wink (one eye closed, the other open). Use good lighting and center your face. The app checks the expression on-device before upload.',
    coachTitle: 'Live verification',
    coachHeadline: 'Big smile or a clear wink',
    coachBody:
      'We use this to confirm a real person is at the camera. Pick one: a clearly visible smile or an obvious wink.',
    coachTipLight: 'Soft front light; avoid strong backlight.',
    coachTipExpression: 'Keep your face centered; hair or glasses should not cover your eyes.',
    coachCta: 'Got it — open camera',
    coachLater: 'Not now',
    invalidTitle: 'Selfie not valid yet',
    invalidBody:
      'We need a clear smile or a visible wink. On-device checks aim for about ≥70% confidence. Try again with better lighting.',
  },
  fr: {
    sectionHelper:
      'Pour valider, montrez un sourire franc ou un clin d’œil net (un œil fermé, l’autre ouvert). Bon éclairage, visage centré. L’app vérifie l’expression sur l’appareil avant l’envoi.',
    coachTitle: 'Vérification en direct',
    coachHeadline: 'Grand sourire ou clin d’œil net',
    coachBody:
      'Nous vérifions qu’une personne réelle est face à la caméra. Choisissez : un sourire bien visible ou un clin d’œil marqué.',
    coachTipLight: 'Lumière frontale douce ; évitez le contre-jour.',
    coachTipExpression: 'Visage centré ; cheveux ou lunettes ne doivent pas couvrir les yeux.',
    coachCta: 'Compris — ouvrir la caméra',
    coachLater: 'Pas maintenant',
    invalidTitle: 'Selfie pas encore valide',
    invalidBody:
      'Il nous faut un sourire clair ou un clin d’œil visible. Le contrôle sur l’appareil vise ~70 % de confiance. Réessayez avec plus de lumière.',
  },
  it: {
    sectionHelper:
      'Per superare la verifica mostra un sorriso chiaro o un ammiccare evidente (un occhio chiuso e l’altro aperto). Buona luce e volto centrato. L’app controlla l’espressione sul dispositivo prima dell’invio.',
    coachTitle: 'Verifica dal vivo',
    coachHeadline: 'Sorriso ampio o ammiccare chiaro',
    coachBody:
      'Così confermiamo che una persona reale è davanti alla fotocamera. Scegli: sorriso ben visibile o ammiccare netto.',
    coachTipLight: 'Luce frontale morbida; evita controluce forte.',
    coachTipExpression: 'Volto centrato; capelli o occhiali non devono coprire gli occhi.',
    coachCta: 'Ok — apri fotocamera',
    coachLater: 'Più tardi',
    invalidTitle: 'Selfie non ancora valida',
    invalidBody:
      'Serve un sorriso chiaro o un ammiccare visibile. Il controllo sul dispositivo punta a ~70 % di confidenza. Riprova con più luce.',
  },
  pt: {
    sectionHelper:
      'Para passar, mostre um sorriso claro ou uma piscadela evidente (um olho fechado e o outro aberto). Boa luz e rosto centralizado. O app verifica a expressão no aparelho antes do envio.',
    coachTitle: 'Verificação ao vivo',
    coachHeadline: 'Sorriso amplo ou piscadela clara',
    coachBody:
      'Assim confirmamos que há uma pessoa real na câmera. Escolha: sorriso bem visível ou piscadela marcada.',
    coachTipLight: 'Luz frontal suave; evite contra-luz.',
    coachTipExpression: 'Rosto centralizado; cabelo ou óculos não podem cobrir os olhos.',
    coachCta: 'Entendi — abrir câmera',
    coachLater: 'Agora não',
    invalidTitle: 'Selfie ainda inválida',
    invalidBody:
      'Precisamos de um sorriso claro ou piscadela visível. A checagem no aparelho busca ~70 % de confiança. Tente de novo com mais luz.',
  },
  de: {
    sectionHelper:
      'Zum Bestehen: zeigen Sie ein deutliches Lächeln oder ein klares Zwinkern (ein Auge zu, das andere offen). Gutes Licht, Gesicht mittig. Die App prüft den Ausdruck auf dem Gerät vor dem Upload.',
    coachTitle: 'Live-Verifizierung',
    coachHeadline: 'Breites Lächeln oder deutliches Zwinkern',
    coachBody:
      'So stellen wir sicher, dass eine echte Person vor der Kamera ist. Wählen Sie: gut sichtbares Lächeln oder klares Zwinkern.',
    coachTipLight: 'Weiches Licht von vorn; kein starkes Gegenlicht.',
    coachTipExpression: 'Gesicht mittig; Haare oder Brille dürfen die Augen nicht verdecken.',
    coachCta: 'Verstanden — Kamera öffnen',
    coachLater: 'Später',
    invalidTitle: 'Selfie noch ungültig',
    invalidBody:
      'Wir brauchen ein klares Lächeln oder sichtbares Zwinkern. Die Geräteprüfung zielt auf ~70 % Konfidenz. Versuchen Sie es mit mehr Licht erneut.',
  },
};

export function verificationSelfieStrings(lang: AppLanguage): VerificationSelfieStrings {
  return STRINGS[lang] ?? STRINGS.en;
}
