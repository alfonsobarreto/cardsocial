/**
 * Merges Finance/Login/Statistics/stats-service strings into adminLocales.json.
 * Run: node scripts/patch-admin-locale-phase2.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '../src/i18n/adminLocales.json');

/** ES + EN primary; IT/PT/FR/DE mirror EN until copyedited. */
const L = (es, en) => ({ es, en, it: en, pt: en, fr: en, de: en });

const chunk = {
  admin_finance_na: L('N/D', 'N/A'),
  admin_finance_err_permissions: L(
    'No se pudieron validar los permisos de finanzas. Por favor, reintenta.',
    'Finance permissions could not be validated. Please try again.',
  ),
  admin_finance_eyebrow_revenue_ops: L('Revenue Ops', 'Revenue Ops'),
  admin_finance_title: L('Finanzas & Revenue', 'Finance & Revenue'),
  admin_finance_subtitle: L(
    'Vista CFO para suscripciones activas y auditoría del pasivo de CS Coins.',
    'CFO view of active subscriptions and CS Coins liability audit.',
  ),
  admin_finance_refresh: L('Refrescar', 'Refresh'),
  admin_finance_tab_subscriptions: L('Suscripciones (Ingresos)', 'Subscriptions (Revenue)'),
  admin_finance_tab_subscriptions_desc: L('Dinero real y estado premium', 'Real money and premium state'),
  admin_finance_tab_cs_bank: L('Banco Central CS', 'CS Central Bank'),
  admin_finance_tab_cs_bank_desc: L('Moneda virtual y pasivo', 'Virtual currency and liability'),
  admin_finance_loading: L('Cargando módulo financiero…', 'Loading finance module…'),
  admin_finance_kpi_active_subs: L('Suscripciones activas', 'Active subscriptions'),
  admin_finance_kpi_mrr: L('MRR estimado', 'Estimated MRR'),
  admin_finance_kpi_arr: L('ARR estimado', 'Estimated ARR'),
  admin_finance_placeholder_amount: L('—', '—'),
  admin_finance_table_title_active: L('Usuarios con subscriptionStatus active', 'Users with active subscriptionStatus'),
  admin_finance_empty_subs: L('No hay suscripciones activas.', 'No active subscriptions.'),
  admin_finance_th_email: L('Email', 'Email'),
  admin_finance_th_tier: L('Tier actual', 'Current tier'),
  admin_finance_th_expires: L('Expira', 'Expires'),
  admin_finance_cs_ledger_title: L('Últimos movimientos del Banco Central CS', 'Latest CS Central Bank movements'),
  admin_finance_cs_ledger_hint: L(
    'Combina admin_audit y redemption_logs para ver emisión/canje de CS Coins.',
    'Combines admin_audit and redemption_logs to view CS Coins issue/redemption.',
  ),
  admin_finance_empty_ledger: L('No hay movimientos registrados.', 'No movements recorded.'),
  admin_finance_th_date: L('Fecha', 'Date'),
  admin_finance_th_action: L('Acción', 'Action'),
  admin_finance_th_amount_cs: L('Monto CS Coins', 'CS Coins amount'),
  admin_finance_th_actor: L('Usuario/Admin', 'User/Admin'),
  admin_finance_suffix_cs: L(' CS', ' CS'),

  admin_login_err_access_denied: L(
    'Acceso denegado. No tienes permisos de Super Administrador.',
    'Access denied. You do not have Super Administrator permissions.',
  ),
  admin_login_err_bad_credentials: L(
    'No se pudo iniciar sesión. Revisa el email y la contraseña.',
    'Could not sign in. Check your email and password.',
  ),
  admin_login_brand_eyebrow: L('Card-Social', 'Card-Social'),
  admin_login_hero_title: L('Centro de comando SuperAdmin', 'SuperAdmin command center'),
  admin_login_hero_subtitle: L(
    'Control operativo para moderación, reglas, campañas VIP, Studio, finanzas y NFC.',
    'Operational control for moderation, rules, VIP campaigns, Studio, finance, and NFC.',
  ),
  admin_login_hero_notice: L(
    'Acceso restringido. Este panel se conecta a Firebase Auth y estará protegido por roles de SuperAdmin antes de activar módulos sensibles.',
    'Restricted access. This panel uses Firebase Auth and will be protected by SuperAdmin roles before sensitive modules activate.',
  ),
  admin_login_form_eyebrow: L('The Mint', 'The Mint'),
  admin_login_form_title: L('Iniciar sesión', 'Sign in'),
  admin_login_form_hint: L(
    'Usa una cuenta autorizada en Firebase para entrar al Admin Web.',
    'Use an authorized Firebase account to access Admin Web.',
  ),
  admin_login_label_email: L('Email', 'Email'),
  admin_login_label_password: L('Contraseña', 'Password'),
  admin_login_submit_loading: L('Entrando…', 'Signing in…'),
  admin_login_submit: L('Entrar al SuperAdmin', 'Enter SuperAdmin'),

  admin_lang_toggle_label: L('Idioma', 'Language'),
  admin_lang_es: L('Español', 'Spanish'),
  admin_lang_en: L('Inglés', 'English'),
  admin_lang_it: L('Italiano', 'Italian'),
  admin_lang_pt: L('Portugués', 'Portuguese'),
  admin_lang_fr: L('Francés', 'French'),
  admin_lang_de: L('Alemán', 'German'),
  admin_layout_session: L('Sesión activa', 'Active session'),
  admin_layout_logout: L('Cerrar sesión', 'Sign out'),
  admin_layout_header_eyebrow: L('Admin Core', 'Admin Core'),
  admin_layout_header_title: L('Operaciones Card-Social', 'Card-Social Operations'),

  admin_stats_err_summary: L('Resumen: {{message}}', 'Overview: {{message}}'),
  admin_stats_err_users_series: L('Usuarios (serie): {{message}}', 'Users (series): {{message}}'),
  admin_stats_err_bc_firestore: L(
    'Business cards (Firestore): {{message}}. Si solo usas Mongo, este gráfico puede quedar vacío.',
    'Business cards (Firestore): {{message}}. If you only use Mongo, this chart may be empty.',
  ),
  admin_stats_err_segmentation: L('Segmentación (usuarios): {{message}}', 'User segmentation: {{message}}'),
  admin_stats_err_smart_cards: L(
    'Tarjetas Smart (collectionGroup cards): {{message}}',
    'Smart cards (collectionGroup cards): {{message}}',
  ),
  admin_stats_err_medal_votes: L(
    'Votos de medallas (30 d): {{message}}. Comprueba índice collectionGroup en votes.votedAt.',
    'Medal votes (30 d): {{message}}. Check the collectionGroup index on votes.votedAt.',
  ),
  admin_stats_note_bc_firestore_vs_mongo: L(
    'Conteo Business Cards en Firestore (businessCards) puede ser menor que Mongo (business_cards). Usa el bloque Mongo del dashboard para la cifra autoritativa.',
    'Firestore businessCards count may be lower than Mongo (business_cards). Use the Mongo block on the dashboard for the authoritative figure.',
  ),

  admin_stats_lang_unknown: L('Desconocido', 'Unknown'),
  admin_stats_lang_spanish: L('Español', 'Spanish'),
  admin_stats_lang_english: L('Inglés', 'English'),
  admin_stats_lang_custom: L('{{label}}', '{{label}}'),
  admin_stats_country_unspecified: L('Sin especificar', 'Unspecified'),
  admin_stats_pie_other: L('Otros ({{count}})', 'Other ({{count}})'),
  admin_stats_tooltip_users_plural: L('Usuarios', 'Users'),

  admin_stats_growth_eyebrow: L('Growth · Estadísticas', 'Growth · Statistics'),
  admin_stats_growth_title: L('Dashboard de crecimiento y producto', 'Growth & product dashboard'),
  admin_stats_growth_intro: L(
    'Serie temporal por createdAt. Segmentación sobre todos los documentos en Firestore users. Fase 2: negocio y licencias desde Mongo vía GET /api/admin/system-stats (gateway + JWT admin.system). Idioma en perfil: language / appLanguage.',
    'Time series by createdAt. Segmentation across all documents in Firestore users. Phase 2: business and licenses from Mongo via GET /api/admin/system-stats (gateway + JWT admin.system). Profile language: language / appLanguage.',
  ),
  admin_stats_refresh: L('Refrescar', 'Refresh'),
  admin_stats_refresh_loading: L('Actualizando…', 'Updating…'),
  admin_stats_warnings_title: L('Avisos', 'Notices'),
  admin_stats_loading_metrics: L('Cargando métricas…', 'Loading metrics…'),
  admin_stats_loading_session: L('Cargando sesión…', 'Loading session…'),
  admin_stats_kpi_section: L('KPIs principales', 'Primary KPIs'),
  admin_stats_kpi_total_users: L('Total usuarios', 'Total users'),
  admin_stats_kpi_total_users_sub: L('Firestore · colección users', 'Firestore · users collection'),
  admin_stats_kpi_new_today: L('Nuevos hoy (UTC)', 'New today (UTC)'),
  admin_stats_kpi_new_today_sub: L(
    'Altas desde medianoche UTC · ventana de series en lookback',
    'Signups since UTC midnight · series lookback window',
  ),
  admin_stats_kpi_licenses: L('Licencias business activas', 'Active business licenses'),
  admin_stats_kpi_licenses_sub: L(
    'Mongo · vencen en 7 d: {{exp7}} · generado {{generated}}',
    'Mongo · expiring in 7 d: {{exp7}} · generated {{generated}}',
  ),
  admin_stats_kpi_licenses_requires_api: L(
    'Requiere API system-stats y ADMIN_SYSTEM_STATS_UIDS en backend.',
    'Requires system-stats API and ADMIN_SYSTEM_STATS_UIDS in the backend.',
  ),
  admin_stats_product_section: L('Producto', 'Product'),
  admin_stats_kpi_bc_mongo: L('Business cards (Mongo)', 'Business cards (Mongo)'),
  admin_stats_kpi_bc_mongo_sub: L('Colección business_cards · fuente autoritativa', 'business_cards collection · authoritative source'),
  admin_stats_kpi_smart_fs: L('Tarjetas Smart (Firestore)', 'Smart cards (Firestore)'),
  admin_stats_kpi_smart_fs_sub: L('collectionGroup users/···/cards', 'collectionGroup users/···/cards'),
  admin_stats_kpi_bc_fs: L('Business cards (Firestore)', 'Business cards (Firestore)'),
  admin_stats_kpi_bc_fs_sub: L('Top-level businessCards · espejo / legado', 'Top-level businessCards · mirror / legacy'),
  admin_stats_kpi_medals: L('Medallas otorgadas (30 d)', 'Medals awarded (30 d)'),
  admin_stats_kpi_medals_sub: L('Docs en medals/···/votes con votedAt en ventana', 'medals/···/votes docs with votedAt in window'),

  admin_stats_tiers_section_title: L(
    'Tiers · usuarios Mongo por subscriptionPlan',
    'Tiers · Mongo users by subscriptionPlan',
  ),
  admin_stats_tiers_section_hint: L(
    'Sincronización con la colección users en Mongo. La política de precios/límites activa del producto sigue en Firestore system_config/tiers.',
    'Synced with the users collection in Mongo. Active pricing/limits policy remains in Firestore system_config/tiers.',
  ),
  admin_stats_th_plan: L('Plan', 'Plan'),
  admin_stats_th_users: L('Usuarios', 'Users'),
  admin_stats_tiers_empty: L('Sin documentos o el agregado devolvió vacío.', 'No documents or aggregation returned empty.'),

  admin_stats_lang_chart_title: L('Idioma (perfil)', 'Language (profile)'),
  admin_stats_users_scanned: L('Usuarios escaneados: {{count}}', 'Users scanned: {{count}}'),
  admin_stats_lang_empty: L('Sin datos de idioma', 'No language data'),
  admin_stats_top_countries_title: L('Top 5 países', 'Top 5 countries'),
  admin_stats_top_countries_hint: L('Campo country en users', 'users.country field'),
  admin_stats_country_empty: L('Sin datos de país', 'No country data'),

  admin_stats_mini_new_24h: L('Nuevos (24 h)', 'New (24 h)'),
  admin_stats_mini_new_24h_sub: L('Ventana móvil', 'Rolling window'),
  admin_stats_mini_new_7d: L('Nuevos (7 d)', 'New (7 d)'),
  admin_stats_mini_new_7d_sub: L('Lookback parcial', 'Partial lookback'),
  admin_stats_mini_bc_7d: L('BC nuevas (7 d, FS)', 'New BC (7 d, FS)'),
  admin_stats_mini_bc_7d_sub: L('businessCards', 'businessCards'),
  admin_stats_mini_series_label: L('Usuarios (serie)', 'Users (series)'),
  admin_stats_mini_series_value: L('30 d', '30 d'),
  admin_stats_mini_series_sub: L('Misma ventana que gráfico diario', 'Same window as daily chart'),

  admin_stats_chart_users_daily_title: L('Usuarios — nuevas altas por día', 'Users — new signups per day'),
  admin_stats_chart_users_daily_sub: L('Últimos 30 días (UTC)', 'Last 30 days (UTC)'),
  admin_stats_chart_users_weekly_title: L('Usuarios — nuevas altas por semana', 'Users — new signups per week'),
  admin_stats_chart_users_weekly_sub: L('Semanas en lunes UTC — últimas 12', 'Weeks on UTC Monday — last 12'),
  admin_stats_chart_bc_daily_title: L('Tarjetas de negocio (Firestore) — por día', 'Business cards (Firestore) — per day'),
  admin_stats_chart_bc_daily_sub: L(
    'Nuevos documentos últimos 30 d · últimos 7 d: {{last7}}',
    'New documents last 30 d · last 7 d: {{last7}}',
  ),
  admin_stats_chart_bc_weekly_title: L('Tarjetas de negocio (Firestore) — por semana', 'Business cards (Firestore) — per week'),
  admin_stats_chart_bc_weekly_sub: L('Últimas 12 semanas (lunes UTC)', 'Last 12 weeks (UTC Monday)'),

  admin_stats_series_new_users: L('Nuevos usuarios', 'New users'),
  admin_stats_series_new_cards: L('Nuevas tarjetas', 'New cards'),
  admin_stats_week_from: L('Semana desde {{date}}', 'Week from {{date}}'),
};

const base = JSON.parse(fs.readFileSync(p, 'utf8'));
for (const [k, row] of Object.entries(chunk)) {
  if (base[k]) console.warn('overwrite', k);
  base[k] = row;
}
fs.writeFileSync(p, JSON.stringify(base, null, 2) + '\n');
console.log('patched', Object.keys(chunk).length, 'keys');
