/**
 * i18n público — página de planes /suscripciones (solo lenguaje de producto).
 */
export type SuscripcionLocale = 'en' | 'es' | 'de' | 'fr' | 'it' | 'pt';

export const SUSCRIPCION_LOCALES: SuscripcionLocale[] = ['en', 'es', 'de', 'fr', 'it', 'pt'];

export function intlLocaleTagForSuscripcion(locale: SuscripcionLocale): string {
  const map: Record<SuscripcionLocale, string> = {
    en: 'en-US',
    es: 'es-MX',
    de: 'de-DE',
    fr: 'fr-FR',
    it: 'it-IT',
    pt: 'pt-BR',
  };
  return map[locale];
}

/** Ruta canónica por idioma (inglés sin prefijo /en). */
export function suscripcionPathForLocale(locale: SuscripcionLocale): string {
  return locale === 'en' ? '/suscripciones' : `/${locale}/suscripciones`;
}

type Dict = Record<string, string>;

const EN: Dict = {
  'meta.title': 'Plans & Membership — Card-Social',
  'meta.description':
    'Membership tiers, CS packs, Market Radar Pro, and premium NFC options — crafted for professionals who expect clarity.',

  'nav.brand': 'Card-Social',
  'nav.home': 'Home',
  'nav.lang': 'Language',
  'nav.openLanding': 'Discover',

  'hero.kicker': 'Current rates',
  'hero.title': 'Plans & membership',
  'hero.subtitle':
    'A discreet overview of what the club offers. Figures update automatically so you always see what applies today.',
  'hero.ctaPrimary': 'Open web Studio',
  'hero.ctaSecondary': 'Join the waitlist',

  'loading': 'Preparing your overview…',

  'section.plans': 'Membership tiers',
  'section.plansLead': 'Reference limits and rates for each tier. In-app checkout completes on your device.',
  'section.business': 'Annual business card license',
  'section.businessLead':
    'Yearly reference for Business members. Purchase and renewal run inside the mobile app with your store account.',
  'section.packs': 'CS coin packs',
  'section.packsLead': 'Bundles of Card-Social credits in USD and CS.',
  'section.packsEmpty': 'Coin packs will appear here when they are available.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Executive market intelligence — optional add-on.',
  'section.nfc': 'NFC hardware & delivery',
  'section.nfcLead': 'Physical cards and shipping — priced with your membership options.',

  'tier.free.name': 'Free',
  'tier.free.blurb': 'Vault, Smart Cards, and the essentials to begin.',
  'tier.influencer.name': 'Influencer',
  'tier.influencer.blurb': 'For creators scaling reach — higher limits and your first Business Card slot.',
  'tier.business.name': 'Business',
  'tier.business.blurb': 'Multiple Business Cards, Social Market, and a premium presence.',

  'limits.title': 'Included limits',
  'limits.iconData': 'IconData max',
  'limits.smartCards': 'Smart Cards max',
  'limits.businessCards': 'Business Cards max',
  'limits.voip': 'VoIP minutes / month (included)',
  'limits.themes': 'Premium themes',
  'limits.giftAnnual': 'Annual welcome allowance (CS)',
  'labels.monthly': 'Monthly',
  'labels.annual': 'Annual',
  'labels.trial': 'Trial days',
  'labels.cs': 'CS credits',
  'labels.usdRef': 'USD (reference)',
  'labels.popular': 'Popular',
  'labels.yes': 'Yes',
  'labels.no': 'No',
  'labels.productId': 'Plan reference',
  'labels.emptyTiers': 'Membership options will appear here soon.',
  'labels.noPriceRow': 'Rate on request for this line.',

  'nfc.extraSlot': 'Extra Business Card slot',
  'nfc.pvc': 'NFC PVC card',
  'nfc.metal': 'NFC metal card',
  'nfc.shipUs': 'Shipping — US domestic',
  'nfc.shipMxCa': 'Shipping — MX / CA',
  'nfc.shipIntl': 'Shipping — International',

  'footer.note':
    'Preferential terms for members. Availability and rates may change; refresh for the latest.',
};

const ES: Dict = {
  ...EN,
  'meta.title': 'Planes y membresía — Card-Social',
  'meta.description':
    'Niveles de membresía, packs CS, Market Radar Pro y opciones NFC premium — claridad para profesionales exigentes.',

  'nav.home': 'Inicio',
  'nav.lang': 'Idioma',
  'nav.openLanding': 'Descubrir',

  'hero.kicker': 'Tarifas vigentes',
  'hero.title': 'Planes y membresías',
  'hero.subtitle':
    'Una vista discreta de lo que ofrece el club. Las cifras se actualizan solas para que veas siempre lo vigente.',
  'hero.ctaPrimary': 'Abrir Studio web',
  'hero.ctaSecondary': 'Lista de espera',

  'loading': 'Preparando tu resumen…',

  'section.plans': 'Niveles de membresía',
  'section.plansLead': 'Límites y tarifas de referencia por nivel. El cobro completo se hace en la app.',
  'section.business': 'Licencia anual — tarjeta negocio',
  'section.businessLead':
    'Referencia anual para miembros Business. Compra y renovación en la app móvil con tu cuenta de tienda.',
  'section.packs': 'Packs de monedas CS',
  'section.packsLead': 'Lotes de créditos Card-Social en USD y CS.',
  'section.packsEmpty': 'Los packs aparecerán aquí cuando estén disponibles.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Inteligencia de mercado ejecutiva — complemento opcional.',
  'section.nfc': 'Hardware NFC y envío',
  'section.nfcLead': 'Tarjetas físicas y envío — alineados con tus opciones de membresía.',

  'tier.free.blurb': 'Vault, Smart Cards y lo esencial para empezar.',
  'tier.influencer.blurb': 'Para creadores que escalan: más cupo y tu primera tarjeta de negocio.',
  'tier.business.blurb': 'Varias Business Cards, Social Market y presencia premium.',

  'limits.title': 'Límites incluidos',
  'limits.iconData': 'IconData máx.',
  'limits.smartCards': 'Smart Cards máx.',
  'limits.businessCards': 'Business Cards máx.',
  'limits.voip': 'Minutos VoIP / mes (incl.)',
  'limits.themes': 'Temas premium',
  'limits.giftAnnual': 'Bonificación anual de bienvenida (CS)',
  'labels.monthly': 'Mensual',
  'labels.annual': 'Anual',
  'labels.trial': 'Días de prueba',
  'labels.cs': 'Créditos CS',
  'labels.usdRef': 'USD (referencia)',
  'labels.popular': 'Popular',
  'labels.yes': 'Sí',
  'labels.no': 'No',
  'labels.productId': 'Referencia de plan',
  'labels.emptyTiers': 'Las opciones de membresía aparecerán aquí en breve.',
  'labels.noPriceRow': 'Tarifa bajo consulta en esta línea.',

  'nfc.extraSlot': 'Hueco Business Card adicional',
  'nfc.pvc': 'Tarjeta NFC PVC',
  'nfc.metal': 'Tarjeta NFC metal',
  'nfc.shipUs': 'Envío — US nacional',
  'nfc.shipMxCa': 'Envío — MX / CA',
  'nfc.shipIntl': 'Envío — Internacional',

  'footer.note':
    'Condiciones preferentes para miembros. Disponibilidad y tarifas sujetas a cambio; actualiza para ver lo último.',
};

const DE: Dict = {
  ...EN,
  'meta.title': 'Pläne & Mitgliedschaft — Card-Social',
  'meta.description':
    'Mitgliedsstufen, CS-Pakete, Market Radar Pro und Premium-NFC — klar für anspruchsvolle Profis.',
  'nav.home': 'Start',
  'nav.lang': 'Sprache',
  'nav.openLanding': 'Entdecken',
  'hero.kicker': 'Aktuelle Tarife',
  'hero.title': 'Pläne & Mitgliedschaft',
  'hero.subtitle':
    'Ein diskreter Überblick über das Angebot. Beträge aktualisieren sich automatisch — immer der aktuelle Stand.',
  'hero.ctaPrimary': 'Web-Studio öffnen',
  'hero.ctaSecondary': 'Warteliste',
  'loading': 'Übersicht wird vorbereitet…',
  'section.plans': 'Mitgliedsstufen',
  'section.plansLead': 'Referenz-Limits und Tarife pro Stufe. Checkout erfolgt in der App.',
  'section.business': 'Jährliche Business-Card-Lizenz',
  'section.businessLead':
    'Jahresreferenz für Business-Mitglieder. Kauf und Verlängerung in der mobilen App mit Store-Konto.',
  'section.packs': 'CS-Münzpakete',
  'section.packsLead': 'Bundles Card-Social-Credits in USD und CS.',
  'section.packsEmpty': 'Pakete erscheinen hier, sobald verfügbar.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Executive Market Intelligence — optionales Add-on.',
  'section.nfc': 'NFC & Lieferung',
  'section.nfcLead': 'Physische Karten und Versand — passend zu Ihrer Mitgliedschaft.',
  'tier.free.blurb': 'Vault, Smart Cards und das Wesentliche zum Start.',
  'tier.influencer.blurb': 'Für Creator mit mehr Reichweite.',
  'tier.business.blurb': 'Mehr Business Cards und Social Market.',
  'limits.title': 'Enthaltene Limits',
  'limits.iconData': 'IconData max.',
  'limits.smartCards': 'Smart Cards max.',
  'limits.businessCards': 'Business Cards max.',
  'limits.voip': 'VoIP-Min./Monat',
  'limits.themes': 'Premium-Themes',
  'limits.giftAnnual': 'Jährliche Willkommensgutschrift (CS)',
  'labels.monthly': 'Monatlich',
  'labels.annual': 'Jährlich',
  'labels.trial': 'Testtage',
  'labels.cs': 'CS-Credits',
  'labels.yes': 'Ja',
  'labels.no': 'Nein',
  'labels.usdRef': 'USD (Referenz)',
  'labels.emptyTiers': 'Mitgliedsoptionen erscheinen in Kürze.',
  'labels.noPriceRow': 'Preis auf Anfrage.',
  'nfc.extraSlot': 'Zusätzlicher Business-Slot',
  'nfc.pvc': 'NFC-PVC-Karte',
  'nfc.metal': 'NFC-Metallkarte',
  'nfc.shipUs': 'Versand — USA',
  'nfc.shipMxCa': 'Versand — MX / CA',
  'nfc.shipIntl': 'Versand — International',
  'footer.note':
    'Vorzugskonditionen für Mitglieder. Verfügbarkeit und Tarife können sich ändern.',
};

const FR: Dict = {
  ...EN,
  'meta.title': 'Offres & adhésion — Card-Social',
  'meta.description':
    'Niveaux d’adhésion, packs CS, Market Radar Pro et NFC premium — clarté pour les professionnels exigeants.',
  'nav.home': 'Accueil',
  'nav.lang': 'Langue',
  'nav.openLanding': 'Découvrir',
  'hero.kicker': 'Tarifs en vigueur',
  'hero.title': 'Offres & adhésion',
  'hero.subtitle':
    'Aperçu discret de ce que le club propose. Les montants se mettent à jour automatiquement.',
  'hero.ctaPrimary': 'Ouvrir Studio web',
  'hero.ctaSecondary': 'Liste d’attente',
  'loading': 'Préparation de votre aperçu…',
  'section.plans': 'Niveaux d’adhésion',
  'section.plansLead': 'Limites et tarifs de référence par niveau. Paiement complet dans l’app.',
  'section.business': 'Licence annuelle — carte Business',
  'section.businessLead':
    'Référence annuelle pour les membres Business. Achat et renouvellement dans l’app mobile.',
  'section.packs': 'Packs de pièces CS',
  'section.packsLead': 'Lots de crédits Card-Social en USD et CS.',
  'section.packsEmpty': 'Les packs apparaîtront ici lorsqu’ils seront disponibles.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Intelligence marché exécutive — option.',
  'section.nfc': 'NFC & livraison',
  'section.nfcLead': 'Cartes physiques et expédition — alignés sur votre adhésion.',
  'tier.free.blurb': 'Vault, Smart Cards et l’essentiel pour commencer.',
  'tier.influencer.blurb': 'Pour les créateurs qui montent en puissance.',
  'tier.business.blurb': 'Plus de cartes Business et Social Market.',
  'limits.title': 'Limites incluses',
  'limits.iconData': 'IconData max',
  'limits.smartCards': 'Smart Cards max',
  'limits.businessCards': 'Business Cards max',
  'limits.voip': 'Minutes VoIP / mois',
  'limits.themes': 'Thèmes premium',
  'limits.giftAnnual': 'Allocation de bienvenue annuelle (CS)',
  'labels.monthly': 'Mensuel',
  'labels.annual': 'Annuel',
  'labels.trial': 'Jours d’essai',
  'labels.cs': 'Crédits CS',
  'labels.yes': 'Oui',
  'labels.no': 'Non',
  'labels.usdRef': 'USD (référence)',
  'labels.emptyTiers': 'Les options d’adhésion apparaîtront bientôt ici.',
  'labels.noPriceRow': 'Tarif sur demande.',
  'nfc.extraSlot': 'Emplacement Business supplémentaire',
  'nfc.pvc': 'Carte NFC PVC',
  'nfc.metal': 'Carte NFC métal',
  'nfc.shipUs': 'Livraison — US',
  'nfc.shipMxCa': 'Livraison — MX / CA',
  'nfc.shipIntl': 'Livraison — International',
  'footer.note':
    'Conditions privilégiées pour les membres. Disponibilité et tarifs susceptibles d’évoluer.',
};

const IT: Dict = {
  ...EN,
  'meta.title': 'Piani e iscrizione — Card-Social',
  'meta.description':
    'Livelli di membership, pacchetti CS, Market Radar Pro e NFC premium — chiarezza per professionisti.',
  'nav.home': 'Home',
  'nav.lang': 'Lingua',
  'nav.openLanding': 'Scopri',
  'hero.kicker': 'Tariffe attuali',
  'hero.title': 'Piani e membership',
  'hero.subtitle':
    'Una panoramica discreta di ciò che offre il club. Cifre sempre aggiornate.',
  'hero.ctaPrimary': 'Apri Studio web',
  'hero.ctaSecondary': 'Lista d’attesa',
  'loading': 'Preparazione della panoramica…',
  'section.plans': 'Livelli di membership',
  'section.plansLead': 'Limiti e tariffe di riferimento. Checkout nell’app.',
  'section.business': 'Licenza annuale — carta Business',
  'section.businessLead':
    'Riferimento annuale per membri Business. Acquisto e rinnovo nell’app mobile.',
  'section.packs': 'Pacchetti monete CS',
  'section.packsLead': 'Bundle di crediti Card-Social in USD e CS.',
  'section.packsEmpty': 'I pacchetti compariranno qui quando disponibili.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Intelligence di mercato executive — opzione.',
  'section.nfc': 'NFC e spedizione',
  'section.nfcLead': 'Carte fisiche e consegna — in linea con la membership.',
  'tier.free.blurb': 'Vault, Smart Cards e l’essenziale per iniziare.',
  'tier.influencer.blurb': 'Per creator in crescita.',
  'tier.business.blurb': 'Più Business Card e Social Market.',
  'limits.title': 'Limiti inclusi',
  'limits.iconData': 'IconData max',
  'limits.smartCards': 'Smart Cards max',
  'limits.businessCards': 'Business Cards max',
  'limits.voip': 'Minuti VoIP / mese',
  'limits.themes': 'Temi premium',
  'limits.giftAnnual': 'Accoglienza annuale (CS)',
  'labels.monthly': 'Mensile',
  'labels.annual': 'Annuale',
  'labels.trial': 'Giorni di prova',
  'labels.cs': 'Crediti CS',
  'labels.yes': 'Sì',
  'labels.no': 'No',
  'labels.usdRef': 'USD (riferimento)',
  'labels.emptyTiers': 'Le opzioni di membership compariranno a breve.',
  'labels.noPriceRow': 'Tariffa su richiesta.',
  'nfc.extraSlot': 'Slot Business aggiuntivo',
  'nfc.pvc': 'Carta NFC PVC',
  'nfc.metal': 'Carta NFC metallo',
  'nfc.shipUs': 'Spedizione — US',
  'nfc.shipMxCa': 'Spedizione — MX / CA',
  'nfc.shipIntl': 'Spedizione — internazionale',
  'footer.note':
    'Condizioni privilegiate per i membri. Disponibilità e tariffe possono variare.',
};

const PT: Dict = {
  ...EN,
  'meta.title': 'Planos e associação — Card-Social',
  'meta.description':
    'Níveis de associação, pacotes CS, Market Radar Pro e NFC premium — clareza para profissionais.',
  'nav.home': 'Início',
  'nav.lang': 'Idioma',
  'nav.openLanding': 'Descubra',
  'hero.kicker': 'Tarifas vigentes',
  'hero.title': 'Planos e associação',
  'hero.subtitle':
    'Uma visão discreta do que o clube oferece. Os valores atualizam automaticamente.',
  'hero.ctaPrimary': 'Abrir Studio web',
  'hero.ctaSecondary': 'Lista de espera',
  'loading': 'Preparando seu resumo…',
  'section.plans': 'Níveis de associação',
  'section.plansLead': 'Limites e tarifas de referência. Checkout no app.',
  'section.business': 'Licença anual — cartão Business',
  'section.businessLead':
    'Referência anual para membros Business. Compra e renovação no app móvel.',
  'section.packs': 'Pacotes de moedas CS',
  'section.packsLead': 'Pacotes de créditos Card-Social em USD e CS.',
  'section.packsEmpty': 'Os pacotes aparecerão aqui quando estiverem disponíveis.',
  'section.radar': 'Market Radar Pro',
  'section.radarLead': 'Inteligência de mercado executiva — opcional.',
  'section.nfc': 'NFC e envio',
  'section.nfcLead': 'Cartões físicos e entrega — alinhados à sua associação.',
  'tier.free.blurb': 'Vault, Smart Cards e o essencial para começar.',
  'tier.influencer.blurb': 'Para criadores em crescimento.',
  'tier.business.blurb': 'Mais Business Cards e Social Market.',
  'limits.title': 'Limites incluídos',
  'limits.iconData': 'IconData máx.',
  'limits.smartCards': 'Smart Cards máx.',
  'limits.businessCards': 'Business Cards máx.',
  'limits.voip': 'Min. VoIP / mês',
  'limits.themes': 'Temas premium',
  'limits.giftAnnual': 'Boas-vindas anual (CS)',
  'labels.monthly': 'Mensal',
  'labels.annual': 'Anual',
  'labels.trial': 'Dias de teste',
  'labels.popular': 'Popular',
  'labels.yes': 'Sim',
  'labels.no': 'Não',
  'labels.cs': 'Créditos CS',
  'labels.usdRef': 'USD (referência)',
  'labels.emptyTiers': 'As opções de associação aparecerão em breve.',
  'labels.noPriceRow': 'Tarifa sob consulta.',
  'nfc.extraSlot': 'Slot Business extra',
  'nfc.pvc': 'Cartão NFC PVC',
  'nfc.metal': 'Cartão NFC metal',
  'nfc.shipUs': 'Frete — EUA',
  'nfc.shipMxCa': 'Frete — MX / CA',
  'nfc.shipIntl': 'Frete — internacional',
  'footer.note':
    'Condições privilegiadas para membros. Disponibilidade e tarifas podem mudar.',
};

const DICTS: Record<SuscripcionLocale, Dict> = {
  en: EN,
  es: ES,
  de: DE,
  fr: FR,
  it: IT,
  pt: PT,
};

export function isSuscripcionLocale(value: string | undefined): value is SuscripcionLocale {
  return value === 'en' || value === 'es' || value === 'de' || value === 'fr' || value === 'it' || value === 'pt';
}

export function tr(locale: SuscripcionLocale, key: string): string {
  const dict = DICTS[locale];
  const s = dict[key] ?? EN[key] ?? key;
  return s;
}
