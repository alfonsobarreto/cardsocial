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
      'La comprobación local pide una sonrisa o guiño muy suave (umbral ~10 %) y rostro visible. Si vuelve a fallar, podrás enviar la foto igual: Azure validará en el servidor. Mejora la luz y el encuadre.',
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
      'On-device check uses a low threshold (~10% smile or a visible wink) and a visible face. If it fails again, you can still upload — the server will verify. Try better lighting.',
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
      'Contrôle sur l’appareil : sourire/clin d’œil avec seuil bas (~10 %) et visage visible. Si ça échoue encore, l’envoi reste possible — vérification serveur. Réessayez avec plus de lumière.',
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
      'Il controllo locale usa una soglia bassa (~10 % sorriso o ammiccare) e volto visibile. Se fallisce di nuovo, puoi comunque inviare: validazione lato server. Riprova con più luce.',
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
      'A checagem local usa limiar baixo (~10 % sorriso ou piscadela) e rosto visível. Se falhar de novo, ainda pode enviar — o servidor valida. Tente com mais luz.',
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
      'Die Geräteprüfung nutzt eine niedrige Schwelle (~10 % Lächeln oder Zwinkern) und sichtbares Gesicht. Schlägt es erneut fehl, können Sie trotzdem hochladen — der Server prüft. Mehr Licht kann helfen.',
  },
};

export function verificationSelfieStrings(lang: AppLanguage): VerificationSelfieStrings {
  return STRINGS[lang] ?? STRINGS.en;
}
