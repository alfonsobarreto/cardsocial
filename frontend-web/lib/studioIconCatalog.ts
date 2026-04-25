export type StudioCatalogIcon = {
  label: string;
  labelEn: string;
  icon: string;
};

export type StudioCatalogSection = {
  title: string;
  titleEn: string;
  items: StudioCatalogIcon[];
  emptyLabel?: string;
  emptyLabelEn?: string;
};

const TEXAS_LONGHORNS_ICON_SEEDS: StudioCatalogIcon[] = [
  { icon: 'football', label: 'Fútbol americano', labelEn: 'Football' },
  { icon: 'trophy', label: 'Trofeo', labelEn: 'Trophy' },
  { icon: 'star', label: 'Estrella', labelEn: 'Star' },
  { icon: 'bullhorn', label: 'Megáfono', labelEn: 'Bullhorn' },
  { icon: 'flag', label: 'Bandera', labelEn: 'Flag' },
  { icon: 'map-marker', label: 'Ubicación', labelEn: 'Map Marker' },
  { icon: 'fire', label: 'Espíritu', labelEn: 'Spirit Fire' },
  { icon: 'shield-half-full', label: 'Equipo', labelEn: 'Team Shield' },
  { icon: 'account-group', label: 'Afición', labelEn: 'Fans' },
  { icon: 'music-note', label: 'Banda', labelEn: 'Marching Band' },
  { icon: 'silverware-fork-knife', label: 'Tailgate', labelEn: 'Tailgate' },
  { icon: 'white-balance-sunny', label: 'Sol', labelEn: 'Texas Sun' },
  { icon: 'medal', label: 'Medalla', labelEn: 'Medal' },
  { icon: 'basketball', label: 'Baloncesto', labelEn: 'Basketball' },
  { icon: 'horse', label: 'Longhorn', labelEn: 'Longhorn' },
];

export const STUDIO_ICON_SECTIONS: StudioCatalogSection[] = [
  {
    title: 'Esenciales · Enlaces',
    titleEn: 'Essentials · Links',
    items: [
      { label: 'LinkedIn', labelEn: 'LinkedIn', icon: 'linkedin' },
      { label: 'Instagram', labelEn: 'Instagram', icon: 'instagram' },
      { label: 'Facebook', labelEn: 'Facebook', icon: 'facebook' },
      { label: 'WhatsApp', labelEn: 'WhatsApp', icon: 'whatsapp' },
      { label: 'Twitter/X', labelEn: 'Twitter/X', icon: 'twitter' },
      { label: 'TikTok', labelEn: 'TikTok', icon: 'music-note' },
      { label: 'YouTube', labelEn: 'YouTube', icon: 'youtube' },
      { label: 'Snapchat', labelEn: 'Snapchat', icon: 'snapchat' },
      { label: 'Web', labelEn: 'Web', icon: 'web' },
      { label: 'Enlace', labelEn: 'Link', icon: 'link-variant' },
    ],
  },
  {
    title: 'Esenciales · Teléfonos',
    titleEn: 'Essentials · Phones',
    items: [
      { label: 'Llamada', labelEn: 'Call', icon: 'phone-in-talk' },
      { label: 'Apple', labelEn: 'Apple', icon: 'apple' },
      { label: 'Android', labelEn: 'Android', icon: 'android' },
      { label: 'Teléfono', labelEn: 'Phone', icon: 'phone' },
      { label: 'Clásico', labelEn: 'Classic', icon: 'phone-classic' },
      { label: 'Celular', labelEn: 'Mobile', icon: 'cellphone' },
      { label: 'WhatsApp', labelEn: 'WhatsApp', icon: 'whatsapp' },
      { label: 'Tablet', labelEn: 'Tablet', icon: 'tablet-cellphone' },
      { label: 'Vibrar', labelEn: 'Vibrate', icon: 'vibrate' },
      { label: 'VoIP', labelEn: 'VoIP', icon: 'phone-voip' },
      { label: 'Contactos', labelEn: 'Contacts', icon: 'contacts' },
    ],
  },
  {
    title: 'Esenciales · Emails',
    titleEn: 'Essentials · Emails',
    items: [
      { label: 'Gmail', labelEn: 'Gmail', icon: 'gmail' },
      { label: 'Email', labelEn: 'Email', icon: 'email-outline' },
      { label: 'Abierto', labelEn: 'Open', icon: 'email-open' },
      { label: 'Outlook', labelEn: 'Outlook', icon: 'microsoft-outlook' },
      { label: 'Yahoo', labelEn: 'Yahoo', icon: 'yahoo' },
      { label: 'Buzón', labelEn: 'Mailbox', icon: 'mailbox' },
      { label: 'Enviar', labelEn: 'Send', icon: 'send' },
      { label: 'Sello', labelEn: 'Stamp', icon: 'certificate' },
      { label: 'Arroba', labelEn: 'At Sign', icon: 'at' },
      { label: 'Alt Email', labelEn: 'Alt Email', icon: 'email' },
    ],
  },
  {
    title: 'Esenciales · Texto',
    titleEn: 'Essentials · Text',
    items: [
      { label: 'Cuadro Texto', labelEn: 'Text Box', icon: 'text-box-outline' },
      { label: 'Formato', labelEn: 'Format', icon: 'format-text' },
      { label: 'Nota', labelEn: 'Note', icon: 'note-text-outline' },
      { label: 'Mensaje', labelEn: 'Message', icon: 'message-text-outline' },
      { label: 'Portapapeles', labelEn: 'Clipboard', icon: 'clipboard-text-outline' },
      { label: 'Texto', labelEn: 'Text', icon: 'text' },
      { label: 'Párrafo', labelEn: 'Paragraph', icon: 'format-paragraph' },
      { label: 'Cita', labelEn: 'Quote', icon: 'format-quote-close' },
      { label: 'Pluma', labelEn: 'Pen', icon: 'pen' },
      { label: 'Lápiz', labelEn: 'Pencil', icon: 'pencil-outline' },
    ],
  },
  {
    title: 'Esenciales · Seguridad / Estilo',
    titleEn: 'Essentials · Security / Style',
    items: [
      { label: 'Llave', labelEn: 'Key', icon: 'key' },
      { label: 'Escudo', labelEn: 'Shield', icon: 'shield-check' },
      { label: 'Candado', labelEn: 'Lock', icon: 'lock' },
      { label: 'Carpeta', labelEn: 'Folder', icon: 'folder-lock' },
      { label: 'Ojo', labelEn: 'Eye', icon: 'eye-outline' },
      { label: 'Huella', labelEn: 'Fingerprint', icon: 'fingerprint' },
      { label: 'Estrella', labelEn: 'Star', icon: 'star' },
      { label: 'Diamante', labelEn: 'Diamond', icon: 'diamond-stone' },
      { label: 'Corona', labelEn: 'Crown', icon: 'crown' },
      { label: 'Corazón', labelEn: 'Heart', icon: 'heart' },
      { label: 'Rayo', labelEn: 'Flash', icon: 'flash' },
    ],
  },
  {
    title: 'Esenciales · Documentos',
    titleEn: 'Essentials · Documents',
    items: [
      { label: 'PDF', labelEn: 'PDF', icon: 'file-pdf-box' },
      { label: 'Imagen', labelEn: 'Image', icon: 'file-image' },
      { label: 'Video', labelEn: 'Video', icon: 'file-video' },
      { label: 'Word', labelEn: 'Word', icon: 'file-word' },
      { label: 'Excel', labelEn: 'Excel', icon: 'file-excel' },
      { label: 'Doc', labelEn: 'Doc', icon: 'file-document' },
      { label: 'PPT', labelEn: 'PPT', icon: 'presentation' },
      { label: 'Música', labelEn: 'Music', icon: 'file-music' },
      { label: 'ZIP', labelEn: 'ZIP', icon: 'zip-box' },
      { label: 'Carpeta', labelEn: 'Folder', icon: 'folder-zip' },
    ],
  },
  {
    title: 'Themes temáticos · Texas Longhorns',
    titleEn: 'Thematic themes · Texas Longhorns',
    items: TEXAS_LONGHORNS_ICON_SEEDS,
  },
  {
    title: 'Luxury · Colección Luxury',
    titleEn: 'Luxury · Luxury collection',
    items: [],
    emptyLabel: 'Iconos vector luxury — Próximamente en boutique',
    emptyLabelEn: 'Luxury vector icons — Coming soon to the boutique',
  },
  {
    title: 'Animados · GIF / Lottie',
    titleEn: 'Animated · GIF / Lottie',
    items: [],
    emptyLabel: 'Iconos animados — Próximamente',
    emptyLabelEn: 'Animated icons — Coming soon',
  },
  {
    title: '3D · Iconos 3D',
    titleEn: '3D · 3D icons',
    items: [],
    emptyLabel: 'Pack 3D — Próximamente',
    emptyLabelEn: '3D pack — Coming soon',
  },
];

export const STUDIO_ICON_COUNT = STUDIO_ICON_SECTIONS.reduce((n, section) => n + section.items.length, 0);
