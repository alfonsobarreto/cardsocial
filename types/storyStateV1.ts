/**
 * Contrato sugerido para sincronización futura de Story (metadatos + referencias).
 * La app persiste hoy `LocalStory` en AsyncStorage; este tipo documenta el shape objetivo API.
 */
export type StoryStateContentType = 'image' | 'video' | 'text';

export interface StoryStatePayloadV1 {
  type: StoryStateContentType;
  /** URL remota o texto plano según `type` */
  content: string;
  /** Modo texto: identificador de fondo o token de gradiente */
  backgroundColor?: string;
  fontFamily?: string;
  /** Referencia al ítem de bóveda usado como CTA */
  vaultItemId: string;
  expiresAt: string;
  isVip: boolean;
}
