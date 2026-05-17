import { ADMIN_LOCALE_ORDER, type AdminLocale, useAdminLocale } from '../i18n/AdminLocaleProvider';
import { useAdminT } from '../i18n/useAdminT';

const LANG_LABELS: Record<AdminLocale, string> = {
  es: 'Español',
  en: 'English',
};

export function AdminLanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useAdminLocale();
  const { t } = useAdminT();

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-slate-500">{t('admin_lang_toggle_label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as AdminLocale)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
      >
        {ADMIN_LOCALE_ORDER.map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
