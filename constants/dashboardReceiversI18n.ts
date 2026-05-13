import type { AppLanguage } from '@/services/language';

export type DashboardReceiversStrings = {
  metricTitle: string;
  metricSubtitle: string;
  heroZero: string;
  heroOne: string;
  heroMany: string;
  tapForHistory: string;
  modalTitle: string;
  modalSubtitle: string;
  tabDay: string;
  tabMonth: string;
  tabYear: string;
  totalActiveLabel: string;
  inPeriodLabel: string;
  periodPrev: string;
  periodNext: string;
  close: string;
  loading: string;
  emptyChart: string;
  peopleAdded: string;
};

const STRINGS: Record<AppLanguage, DashboardReceiversStrings> = {
  es: {
    metricTitle: 'Tu red crece',
    metricSubtitle: 'Personas con tu tarjeta en su lista',
    heroZero: 'Cuando recibas tu primer contacto, ¡lo celebramos contigo!',
    heroOne: '¡Genial! Ya hay alguien que guardó tu tarjeta.',
    heroMany: '¡Vas muy bien! {n} personas ya tienen tu tarjeta.',
    tapForHistory: 'Toca para ver el historial',
    modalTitle: 'Contactos que guardaron tu tarjeta',
    modalSubtitle: 'Nuevas altas por periodo',
    tabDay: 'Día',
    tabMonth: 'Mes',
    tabYear: 'Año',
    totalActiveLabel: 'Activos en total',
    inPeriodLabel: 'Altas en este periodo',
    periodPrev: 'Anterior',
    periodNext: 'Siguiente',
    close: 'Cerrar',
    loading: 'Cargando…',
    emptyChart: 'Sin nuevas altas en este periodo. ¡Comparte tu QR!',
    peopleAdded: 'altas',
  },
  en: {
    metricTitle: 'Your network is growing',
    metricSubtitle: 'People with your card in their list',
    heroZero: 'When your first contact saves your card, we’ll celebrate with you!',
    heroOne: 'Nice — someone already saved your card.',
    heroMany: 'You’re on a roll — {n} people have your card.',
    tapForHistory: 'Tap for history',
    modalTitle: 'Contacts who saved your card',
    modalSubtitle: 'New adds by period',
    tabDay: 'Day',
    tabMonth: 'Month',
    tabYear: 'Year',
    totalActiveLabel: 'Total active',
    inPeriodLabel: 'Adds in this range',
    periodPrev: 'Previous',
    periodNext: 'Next',
    close: 'Close',
    loading: 'Loading…',
    emptyChart: 'No new adds in this range yet. Share your QR!',
    peopleAdded: 'adds',
  },
  fr: {
    metricTitle: 'Votre réseau grandit',
    metricSubtitle: 'Personnes qui ont votre carte',
    heroZero: 'Dès qu’un premier contact enregistre votre carte, on fête ça avec vous !',
    heroOne: 'Super — quelqu’un a déjà enregistré votre carte.',
    heroMany: 'Ça marche — {n} personnes ont votre carte.',
    tapForHistory: 'Toucher pour l’historique',
    modalTitle: 'Contacts qui ont enregistré votre carte',
    modalSubtitle: 'Nouveaux ajouts par période',
    tabDay: 'Jour',
    tabMonth: 'Mois',
    tabYear: 'Année',
    totalActiveLabel: 'Total actifs',
    inPeriodLabel: 'Ajouts sur cette période',
    periodPrev: 'Précédent',
    periodNext: 'Suivant',
    close: 'Fermer',
    loading: 'Chargement…',
    emptyChart: 'Pas de nouveaux ajouts sur cette période. Partagez votre QR !',
    peopleAdded: 'ajouts',
  },
  it: {
    metricTitle: 'La tua rete cresce',
    metricSubtitle: 'Persone con la tua card in elenco',
    heroZero: 'Quando il primo contatto salva la tua card, festeggiamo insieme!',
    heroOne: 'Ottimo — qualcuno ha già salvato la tua card.',
    heroMany: 'Ottimo lavoro — {n} persone hanno la tua card.',
    tapForHistory: 'Tocca per lo storico',
    modalTitle: 'Contatti che hanno salvato la card',
    modalSubtitle: 'Nuovi salvataggi per periodo',
    tabDay: 'Giorno',
    tabMonth: 'Mese',
    tabYear: 'Anno',
    totalActiveLabel: 'Totale attivi',
    inPeriodLabel: 'Nuovi in questo periodo',
    periodPrev: 'Precedente',
    periodNext: 'Successivo',
    close: 'Chiudi',
    loading: 'Caricamento…',
    emptyChart: 'Nessun nuovo salvataggio in questo periodo. Condividi il QR!',
    peopleAdded: 'aggiunte',
  },
  pt: {
    metricTitle: 'Sua rede cresce',
    metricSubtitle: 'Pessoas com seu cartão na lista',
    heroZero: 'Quando o primeiro contato salvar seu cartão, comemoramos com você!',
    heroOne: 'Ótimo — alguém já salvou seu cartão.',
    heroMany: 'Muito bem — {n} pessoas têm seu cartão.',
    tapForHistory: 'Toque para ver o histórico',
    modalTitle: 'Contatos que salvaram seu cartão',
    modalSubtitle: 'Novas entradas por período',
    tabDay: 'Dia',
    tabMonth: 'Mês',
    tabYear: 'Ano',
    totalActiveLabel: 'Ativos no total',
    inPeriodLabel: 'Novas entradas no período',
    periodPrev: 'Anterior',
    periodNext: 'Próximo',
    close: 'Fechar',
    loading: 'Carregando…',
    emptyChart: 'Sem novas entradas neste período. Compartilhe seu QR!',
    peopleAdded: 'entradas',
  },
  de: {
    metricTitle: 'Ihr Netzwerk wächst',
    metricSubtitle: 'Personen mit Ihrer Karte in der Liste',
    heroZero: 'Wenn der erste Kontakt Ihre Karte speichert, feiern wir mit!',
    heroOne: 'Schön — jemand hat Ihre Karte schon gespeichert.',
    heroMany: 'Stark — {n} Personen haben Ihre Karte.',
    tapForHistory: 'Tippen für Verlauf',
    modalTitle: 'Kontakte, die Ihre Karte gespeichert haben',
    modalSubtitle: 'Neue Speicherungen nach Zeitraum',
    tabDay: 'Tag',
    tabMonth: 'Monat',
    tabYear: 'Jahr',
    totalActiveLabel: 'Gesamt aktiv',
    inPeriodLabel: 'Neu in diesem Zeitraum',
    periodPrev: 'Zurück',
    periodNext: 'Weiter',
    close: 'Schließen',
    loading: 'Laden…',
    emptyChart: 'Keine neuen Speicherungen in diesem Zeitraum. Teilen Sie Ihren QR-Code!',
    peopleAdded: 'Neue',
  },
};

export function dashboardReceiversStrings(lang: AppLanguage): DashboardReceiversStrings {
  return STRINGS[lang] ?? STRINGS.en;
}
