import type { CoreLocaleKey } from '@/services/coreI18n';

export type InAppNotificationTemplateId =
  | 'MOD_REPORT_APPROVED'
  | 'MOD_REPORT_REJECTED'
  | 'SYS_WELCOME_MISSING_CARD'
  | 'SYS_ACCOUNT_EXPIRING'
  | 'SYS_GLOBAL_MAINTENANCE'
  | 'SYS_GLOBAL_PROMO';

const TITLE_BODY_MAP: Record<InAppNotificationTemplateId, { title: CoreLocaleKey; body: CoreLocaleKey }> = {
  MOD_REPORT_APPROVED: {
    title: 'notif_tpl_MOD_REPORT_APPROVED_title',
    body: 'notif_tpl_MOD_REPORT_APPROVED_body',
  },
  MOD_REPORT_REJECTED: {
    title: 'notif_tpl_MOD_REPORT_REJECTED_title',
    body: 'notif_tpl_MOD_REPORT_REJECTED_body',
  },
  SYS_WELCOME_MISSING_CARD: {
    title: 'notif_tpl_SYS_WELCOME_MISSING_CARD_title',
    body: 'notif_tpl_SYS_WELCOME_MISSING_CARD_body',
  },
  SYS_ACCOUNT_EXPIRING: {
    title: 'notif_tpl_SYS_ACCOUNT_EXPIRING_title',
    body: 'notif_tpl_SYS_ACCOUNT_EXPIRING_body',
  },
  SYS_GLOBAL_MAINTENANCE: {
    title: 'notif_tpl_SYS_GLOBAL_MAINTENANCE_title',
    body: 'notif_tpl_SYS_GLOBAL_MAINTENANCE_body',
  },
  SYS_GLOBAL_PROMO: {
    title: 'notif_tpl_SYS_GLOBAL_PROMO_title',
    body: 'notif_tpl_SYS_GLOBAL_PROMO_body',
  },
};

export function resolveNotificationCopyKeys(
  templateId: string,
): { title: CoreLocaleKey; body: CoreLocaleKey } | null {
  const row = TITLE_BODY_MAP[templateId as InAppNotificationTemplateId];
  return row ?? null;
}
