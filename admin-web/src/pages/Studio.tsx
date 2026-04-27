/**
 * LA FORJA — Visual Builder (admin)
 * Estado global con useReducer; preview con variables CSS en tiempo real.
 */

import { HexColorPicker, HexColorInput } from 'react-colorful';
import {
  ChevronDown,
  Diamond,
  ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  MonitorSmartphone,
  Palette,
  Sparkles,
  Type,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  type ComponentType,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/useAuth';
import {
  createStudioIconPack,
  getStudioFonts,
  listStudioIconPacks,
  listStudioSkins,
  listStudioThemes,
  publishStudioSkin,
  saveStudioTheme,
  type StudioBackgroundMode,
  type StudioFont,
  type StudioIconPackDoc,
  type StudioSkinDoc,
  type StudioThemeDoc,
} from '../services/studioService';

// ── Google Fonts (API pública CSS, sin key) ─────────────────────────────────
const GOOGLE_FONT_OPTIONS = [
  { id: 'Inter', label: 'Inter' },
  { id: 'Roboto', label: 'Roboto' },
  { id: 'Open+Sans', label: 'Open Sans' },
  { id: 'Lato', label: 'Lato' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'Raleway', label: 'Raleway' },
  { id: 'Nunito', label: 'Nunito' },
  { id: 'Merriweather', label: 'Merriweather' },
  { id: 'Playfair+Display', label: 'Playfair Display' },
  { id: 'Space+Grotesk', label: 'Space Grotesk' },
  { id: 'DM+Sans', label: 'DM Sans' },
  { id: 'Outfit', label: 'Outfit' },
  { id: 'Sora', label: 'Sora' },
  { id: 'Manrope', label: 'Manrope' },
] as const;

type ForgeTab = 'theme' | 'icons' | 'skins';

type ThemeForgeState = {
  name: string;
  bgMode: StudioBackgroundMode;
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  imageUrl: string;
  glassBlur: number;
  glassOpacity: number;
  btnBg: string;
  btnBorder: string;
  btnText: string;
  btnRadius: number;
  btnBorderWidth: number;
  btnGlow: boolean;
  textColor: string;
  secondaryAccent: string;
  fontSource: 'google' | 'custom';
  googleFont: string;
  customFontId: string;
  fontSizeBase: number;
};

type IconPackForgeState = {
  name: string;
  iconBorderRadius: number;
  iconSize: number;
  containerBg: string;
  files: File[];
};

type SkinForgeState = {
  name: string;
  themeId: string;
  iconPackId: string;
  priceCoins: number;
  priceDiamondsUsd: number;
  tier: 'free' | 'premium';
  status: 'draft' | 'published';
};

type ForgeState = {
  tab: ForgeTab;
  theme: ThemeForgeState;
  iconPack: IconPackForgeState;
  skin: SkinForgeState;
};

const initialTheme = (): ThemeForgeState => ({
  name: 'Aurora Forge',
  bgMode: 'solid',
  solidColor: '#0b1220',
  gradientFrom: '#1e1b4b',
  gradientTo: '#0f172a',
  gradientAngle: 135,
  imageUrl: '',
  glassBlur: 16,
  glassOpacity: 0.42,
  btnBg: '#3b82f6',
  btnBorder: '#60a5fa',
  btnText: '#ffffff',
  btnRadius: 16,
  btnBorderWidth: 1,
  btnGlow: true,
  textColor: '#f1f5f9',
  secondaryAccent: '#22d3ee',
  fontSource: 'google',
  googleFont: 'Inter',
  customFontId: '',
  fontSizeBase: 15,
});

const initialIconPack = (): IconPackForgeState => ({
  name: '',
  iconBorderRadius: 14,
  iconSize: 30,
  containerBg: '#334155',
  files: [],
});

const initialSkin = (): SkinForgeState => ({
  name: '',
  themeId: '',
  iconPackId: '',
  priceCoins: 0,
  priceDiamondsUsd: 0,
  tier: 'premium',
  status: 'draft',
});

const initialForgeState = (): ForgeState => ({
  tab: 'theme',
  theme: initialTheme(),
  iconPack: initialIconPack(),
  skin: initialSkin(),
});

type ForgeAction =
  | { type: 'SET_TAB'; tab: ForgeTab }
  | { type: 'THEME'; patch: Partial<ThemeForgeState> }
  | { type: 'ICON_PACK'; patch: Partial<IconPackForgeState> }
  | { type: 'ICON_FILES'; files: File[] }
  | { type: 'SKIN'; patch: Partial<SkinForgeState> };

function forgeReducer(state: ForgeState, action: ForgeAction): ForgeState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.tab };
    case 'THEME':
      return { ...state, theme: { ...state.theme, ...action.patch } };
    case 'ICON_PACK':
      return { ...state, iconPack: { ...state.iconPack, ...action.patch } };
    case 'ICON_FILES':
      return { ...state, iconPack: { ...state.iconPack, files: action.files } };
    case 'SKIN':
      return { ...state, skin: { ...state.skin, ...action.patch } };
    default:
      return state;
  }
}

/** Tokens normalizados para el Live Canvas (CSS variables). */
type ForgePreviewTokens = {
  bgMode: StudioBackgroundMode;
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  imageUrl: string | null;
  glassBlur: number;
  glassOpacity: number;
  btnBg: string;
  btnBorder: string;
  btnText: string;
  btnRadius: number;
  btnBorderWidth: number;
  btnGlow: boolean;
  textColor: string;
  secondaryAccent: string;
  fontFamily: string;
  fontSizeBase: number;
  iconUrls: string[];
  iconBorderRadius: number;
  iconSize: number;
  iconContainerBg: string;
};

const PLACEHOLDER_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>',
  );

function docToPreviewTokens(
  th: StudioThemeDoc,
  pk: StudioIconPackDoc,
  fonts: StudioFont[],
): ForgePreviewTokens {
  const custom = th.fontLibraryId ? fonts.find((f) => f.id === th.fontLibraryId) : null;
  const fontFamily = custom?.family
    ? `'${custom.family}', system-ui, sans-serif`
    : th.googleFontFamily
      ? `'${th.googleFontFamily.replace(/\+/g, ' ')}', system-ui, sans-serif`
      : th.fontFamilyCss
        ? `'${th.fontFamilyCss}', system-ui, sans-serif`
        : 'system-ui, sans-serif';

  return {
    bgMode: th.backgroundMode,
    solidColor: th.solidColor,
    gradientFrom: th.gradientFrom,
    gradientTo: th.gradientTo,
    gradientAngle: th.gradientAngle,
    imageUrl: th.wallpaperUrl,
    glassBlur: th.glassBlurPx,
    glassOpacity: th.glassOpacity,
    btnBg: th.btnBg,
    btnBorder: th.btnBorder,
    btnText: th.btnText,
    btnRadius: th.btnRadius,
    btnBorderWidth: th.btnBorderWidth,
    btnGlow: th.btnGlow,
    textColor: th.textColor,
    secondaryAccent: th.secondaryColor,
    fontFamily,
    fontSizeBase: th.fontSizeBase,
    iconUrls: pk.icons.length ? pk.icons.map((i) => i.url) : [PLACEHOLDER_ICON, PLACEHOLDER_ICON, PLACEHOLDER_ICON],
    iconBorderRadius: pk.iconBorderRadiusPx,
    iconSize: pk.iconSizePx,
    iconContainerBg: pk.iconContainerBg,
  };
}

function draftToPreviewTokens(
  theme: ThemeForgeState,
  iconPartial: Pick<IconPackForgeState, 'iconBorderRadius' | 'iconSize' | 'containerBg'>,
  iconUrls: string[],
  fonts: StudioFont[],
): ForgePreviewTokens {
  const custom = theme.fontSource === 'custom' && theme.customFontId ? fonts.find((f) => f.id === theme.customFontId) : null;
  const fontFamily = custom?.family
    ? `'${custom.family}', system-ui, sans-serif`
    : theme.fontSource === 'google'
      ? `'${theme.googleFont.replace(/\+/g, ' ')}', system-ui, sans-serif`
      : 'system-ui, sans-serif';

  let imageUrl: string | null = null;
  if (theme.bgMode === 'image') {
    imageUrl = theme.imageUrl.trim() || null;
  }

  const urls =
    iconUrls.length > 0 ? iconUrls : [PLACEHOLDER_ICON, PLACEHOLDER_ICON, PLACEHOLDER_ICON, PLACEHOLDER_ICON];

  return {
    bgMode: theme.bgMode,
    solidColor: theme.solidColor,
    gradientFrom: theme.gradientFrom,
    gradientTo: theme.gradientTo,
    gradientAngle: theme.gradientAngle,
    imageUrl,
    glassBlur: theme.glassBlur,
    glassOpacity: theme.glassOpacity,
    btnBg: theme.btnBg,
    btnBorder: theme.btnBorder,
    btnText: theme.btnText,
    btnRadius: theme.btnRadius,
    btnBorderWidth: theme.btnBorderWidth,
    btnGlow: theme.btnGlow,
    textColor: theme.textColor,
    secondaryAccent: theme.secondaryAccent,
    fontFamily,
    fontSizeBase: theme.fontSizeBase,
    iconUrls: urls,
    iconBorderRadius: iconPartial.iconBorderRadius,
    iconSize: iconPartial.iconSize,
    iconContainerBg: iconPartial.containerBg,
  };
}

function useGoogleFont(familyParam: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !familyParam) return;
    const id = `gf-admin-${familyParam}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }, [familyParam, enabled]);
}

function useCustomFont(font: StudioFont | null) {
  useEffect(() => {
    if (!font?.fileUrl || !font.family) return;
    const id = `forge-custom-${font.id}`;
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    const fmt = /\.otf$/i.test(font.fileUrl || '') ? 'opentype' : 'truetype';
    el.textContent = `@font-face{font-family:'${font.family}';src:url('${font.fileUrl}') format('${fmt}');font-weight:400 700;font-style:normal;}`;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [font]);
}

function Accordion({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string; size?: number }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/50 shadow-inner shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-800/50"
      >
        <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-100">
          {Icon ? <Icon size={18} className="text-cyan-400" /> : null}
          {title}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-slate-700/80 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="w-28 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-xs text-cyan-300 outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
      </div>
      <div className="forge-colorful rounded-xl border border-slate-700 p-2">
        <HexColorPicker color={value} onChange={onChange} className="!w-full max-w-full" />
      </div>
    </div>
  );
}

function LiveCanvas({ tokens }: { tokens: ForgePreviewTokens }) {
  const backgroundLayer = useMemo(() => {
    if (tokens.bgMode === 'gradient') {
      return {
        background: `linear-gradient(${tokens.gradientAngle}deg, ${tokens.gradientFrom}, ${tokens.gradientTo})`,
      } as CSSProperties;
    }
    if (tokens.bgMode === 'image' && tokens.imageUrl) {
      return {
        backgroundImage: `url(${tokens.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: tokens.solidColor,
      } as CSSProperties;
    }
    return { backgroundColor: tokens.solidColor } as CSSProperties;
  }, [tokens]);

  const cssVars = {
    '--forge-font': tokens.fontFamily,
    '--forge-font-size': `${tokens.fontSizeBase}px`,
    '--forge-text': tokens.textColor,
    '--forge-accent': tokens.secondaryAccent,
    '--forge-btn-bg': tokens.btnBg,
    '--forge-btn-border': tokens.btnBorder,
    '--forge-btn-text': tokens.btnText,
    '--forge-btn-radius': `${tokens.btnRadius}px`,
    '--forge-btn-bw': `${tokens.btnBorderWidth}px`,
    '--forge-glass-blur': `${tokens.glassBlur}px`,
    '--forge-glass-opacity': String(tokens.glassOpacity),
    '--forge-icon-r': `${tokens.iconBorderRadius}px`,
    '--forge-icon-size': `${tokens.iconSize}px`,
    '--forge-icon-wrap-bg': tokens.iconContainerBg,
  } as CSSProperties;

  const btnShadow = tokens.btnGlow
    ? `0 0 24px color-mix(in srgb, ${tokens.btnBg} 55%, transparent), 0 4px 14px rgba(0,0,0,0.35)`
    : '0 4px 14px rgba(0,0,0,0.25)';

  return (
    <div
      className="relative flex min-h-[640px] flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1e293b_0%,_#020617_55%)] px-4 py-10"
      style={cssVars}
    >
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
        <MonitorSmartphone className="h-4 w-4 text-cyan-500" />
        Live Canvas
      </div>

      {/* iPhone 15 Pro bezel */}
      <div
        className="relative w-[min(320px,100%)] shrink-0 rounded-[2.85rem] p-[3px] shadow-2xl"
        style={{
          background: 'linear-gradient(165deg, #71717a 0%, #27272a 22%, #18181b 50%, #3f3f46 100%)',
        }}
      >
        <div className="relative overflow-hidden rounded-[2.65rem] bg-black ring-1 ring-white/10">
          {/* Dynamic Island */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black shadow-lg ring-1 ring-white/5" />

          <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.5rem]">
            <div className="absolute inset-0" style={backgroundLayer} />

            {/* Glass overlay (vitrea) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backdropFilter: `saturate(150%) blur(${tokens.glassBlur}px)`,
                WebkitBackdropFilter: `saturate(150%) blur(${tokens.glassBlur}px)`,
                backgroundColor: `rgba(255,255,255,${tokens.glassOpacity * 0.22})`,
              }}
            />

            <div
              className="relative z-10 flex h-full flex-col overflow-y-auto px-3 pb-8 pt-12"
              style={{ fontFamily: 'var(--forge-font)', fontSize: 'var(--forge-font-size)' }}
            >
              {/* Identity card — glass */}
              <div
                className="flex items-center gap-3 border border-white/20 px-3 py-2.5 shadow-lg"
                style={{
                  borderRadius: 'max(12px, calc(var(--forge-btn-radius) * 0.85))',
                  backgroundColor: `rgba(255,255,255,${0.06 + tokens.glassOpacity * 0.15})`,
                  backdropFilter: `blur(${Math.max(6, tokens.glassBlur * 0.5)}px)`,
                  WebkitBackdropFilter: `blur(${Math.max(6, tokens.glassBlur * 0.5)}px)`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <div
                  className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-2 bg-white/10 text-base font-black"
                  style={{ borderColor: tokens.secondaryAccent, color: 'var(--forge-text)' }}
                >
                  AB
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold leading-tight" style={{ color: 'var(--forge-text)' }}>
                    Card-Social Founder
                  </div>
                  <div className="truncate text-[0.85em] font-semibold opacity-75" style={{ color: 'var(--forge-text)' }}>
                    @forge.identity
                  </div>
                </div>
              </div>

              <p className="mt-3 px-1 text-[0.7rem] font-extrabold uppercase tracking-wider opacity-70" style={{ color: 'var(--forge-text)' }}>
                Enlaces
              </p>

              {['Sitio web', 'Reservar', 'Portfolio'].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="mb-2 w-full py-2.5 text-center text-[0.88em] font-bold transition"
                  style={{
                    backgroundColor: 'var(--forge-btn-bg)',
                    color: 'var(--forge-btn-text)',
                    borderRadius: 'var(--forge-btn-radius)',
                    borderWidth: 'var(--forge-btn-bw)',
                    borderStyle: 'solid',
                    borderColor: 'var(--forge-btn-border)',
                    boxShadow: btnShadow,
                  }}
                >
                  {label}
                </button>
              ))}

              <div
                className="mt-3 flex flex-wrap justify-center gap-2 border-t border-white/15 pt-3"
                style={{ borderRadius: 'var(--forge-btn-radius)' }}
              >
                {tokens.iconUrls.slice(0, 8).map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="flex items-center justify-center border border-white/10 shadow-md"
                    style={{
                      width: `calc(var(--forge-icon-size) + 14px)`,
                      height: `calc(var(--forge-icon-size) + 14px)`,
                      borderRadius: 'var(--forge-icon-r)',
                      backgroundColor: 'var(--forge-icon-wrap-bg)',
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      className="object-contain"
                      style={{ width: 'var(--forge-icon-size)', height: 'var(--forge-icon-size)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-xs text-center text-[11px] leading-relaxed text-slate-500">
        Variables CSS inyectadas desde el reducer. Ajusta sliders: la vista previa sigue el estado en tiempo real.
      </p>
    </div>
  );
}

export default function Studio() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(forgeReducer, undefined, initialForgeState);
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [themes, setThemes] = useState<StudioThemeDoc[]>([]);
  const [packs, setPacks] = useState<StudioIconPackDoc[]>([]);
  const [skins, setSkins] = useState<StudioSkinDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [wallpaperFile, setWallpaperFile] = useState<File | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropActive, setDropActive] = useState(false);

  const iconBlobUrls = useMemo(
    () => state.iconPack.files.map((f) => URL.createObjectURL(f)),
    [state.iconPack.files],
  );

  useEffect(() => {
    return () => {
      iconBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [iconBlobUrls]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [f, t, p, s] = await Promise.all([
        getStudioFonts(),
        listStudioThemes(),
        listStudioIconPacks(),
        listStudioSkins(),
      ]);
      setFonts(f);
      setThemes(t);
      setPacks(p);
      setSkins(s);
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Error cargando datos de la Forja.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const customFont = useMemo(
    () => (state.theme.customFontId ? fonts.find((x) => x.id === state.theme.customFontId) ?? null : null),
    [fonts, state.theme.customFontId],
  );

  useGoogleFont(state.theme.googleFont, state.theme.fontSource === 'google');
  useCustomFont(customFont);

  const previewTokens = useMemo((): ForgePreviewTokens => {
    if (state.tab === 'skins' && state.skin.themeId && state.skin.iconPackId) {
      const th = themes.find((t) => t.id === state.skin.themeId);
      const pk = packs.find((p) => p.id === state.skin.iconPackId);
      if (th && pk) return docToPreviewTokens(th, pk, fonts);
    }
    if (state.tab === 'icons') {
      return draftToPreviewTokens(state.theme, state.iconPack, iconBlobUrls, fonts);
    }
    return draftToPreviewTokens(
      state.theme,
      {
        iconBorderRadius: state.iconPack.iconBorderRadius,
        iconSize: state.iconPack.iconSize,
        containerBg: state.iconPack.containerBg,
      },
      [],
      fonts,
    );
  }, [state, themes, packs, fonts, iconBlobUrls]);

  const handleSaveTheme = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setToast(null);
    try {
      const f = state.theme.fontSource === 'custom' ? fonts.find((x) => x.id === state.theme.customFontId) : null;
      await saveStudioTheme({
        name: state.theme.name,
        backgroundMode: state.theme.bgMode,
        solidColor: state.theme.solidColor,
        gradientFrom: state.theme.gradientFrom,
        gradientTo: state.theme.gradientTo,
        gradientAngle: state.theme.gradientAngle,
        imageUrl: state.theme.imageUrl.trim() || null,
        wallpaperUrl: null,
        wallpaperFile: state.theme.bgMode === 'image' ? wallpaperFile : null,
        glassBlurPx: state.theme.glassBlur,
        glassOpacity: state.theme.glassOpacity,
        btnBg: state.theme.btnBg,
        btnBorder: state.theme.btnBorder,
        btnText: state.theme.btnText,
        btnRadius: state.theme.btnRadius,
        btnBorderWidth: state.theme.btnBorderWidth,
        btnGlow: state.theme.btnGlow,
        textColor: state.theme.textColor,
        secondaryColor: state.theme.secondaryAccent,
        fontLibraryId: state.theme.fontSource === 'custom' ? (f ? f.id : null) : null,
        fontFamilyCss: f?.family ?? null,
        googleFontFamily: state.theme.fontSource === 'google' ? state.theme.googleFont.replace(/\+/g, ' ') : null,
        fontSizeBase: state.theme.fontSizeBase,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      });
      setWallpaperFile(null);
      await refresh();
      setToast({ type: 'success', message: 'Theme forjado y guardado en `studio_themes`.' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Error al guardar theme.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePack = async (e: FormEvent) => {
    e.preventDefault();
    if (!state.iconPack.files.length) {
      setToast({ type: 'error', message: 'Arrastra o selecciona iconos (PNG/SVG).' });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      await createStudioIconPack({
        name: state.iconPack.name,
        files: state.iconPack.files,
        iconBorderRadiusPx: state.iconPack.iconBorderRadius,
        iconSizePx: state.iconPack.iconSize,
        iconContainerBg: state.iconPack.containerBg,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      });
      dispatch({ type: 'ICON_FILES', files: [] });
      dispatch({ type: 'ICON_PACK', patch: { name: '' } });
      await refresh();
      setToast({ type: 'success', message: 'Icon Pack forjado (`studio_icon_packs`).' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Error al crear pack.' });
    } finally {
      setBusy(false);
    }
  };

  const handleForgeSkin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setToast(null);
    try {
      await publishStudioSkin({
        name: state.skin.name,
        priceCoins: state.skin.priceCoins,
        priceDiamonds: state.skin.priceDiamondsUsd,
        tier: state.skin.tier,
        themeId: state.skin.themeId,
        iconPackId: state.skin.iconPackId,
        status: state.skin.status,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      });
      await refresh();
      setToast({ type: 'success', message: 'Skin forjado (`studio_skins`).' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Error al forjar skin.' });
    } finally {
      setBusy(false);
    }
  };

  const onDropFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const next = [...state.iconPack.files, ...Array.from(fileList)].slice(0, 24);
    dispatch({ type: 'ICON_FILES', files: next });
  };

  useEffect(() => {
    if (!toast || toast.type !== 'success') return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>{`
        .forge-colorful .react-colorful { width: 100%; height: 140px; border-radius: 12px; }
        .forge-colorful .react-colorful__saturation { border-radius: 12px 12px 0 0; }
        .forge-colorful .react-colorful__hue { height: 12px; border-radius: 0 0 12px 12px; }
      `}</style>

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 shadow-lg shadow-orange-500/25">
              <Wand2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400/90">Card-Social</p>
              <h1 className="text-xl font-black tracking-tight text-white md:text-2xl">La Forja</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-cyan-400" />}
              Sincronizar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-0 lg:grid-cols-[60%_40%]">
        {/* ── Panel herramientas 60% ── */}
        <div className="border-r border-slate-800 bg-slate-950 px-4 py-6 sm:px-6 lg:min-h-[calc(100vh-88px)]">
          <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-1.5">
            {(
              [
                ['theme', 'Theme Forge', Palette] as const,
                ['icons', 'Icon Forge', LayoutGrid] as const,
                ['skins', 'Master Skins', Diamond] as const,
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => dispatch({ type: 'SET_TAB', tab: key })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition sm:min-w-[120px] ${
                  state.tab === key
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
            </div>
          ) : (
            <>
              {state.tab === 'theme' && (
                <form className="space-y-4 pb-20" onSubmit={handleSaveTheme}>
                  <Accordion title="Fondo (Background)" icon={ImageIcon} defaultOpen>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {(['solid', 'gradient', 'image'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => dispatch({ type: 'THEME', patch: { bgMode: m } })}
                            className={`rounded-xl px-4 py-2 text-xs font-bold capitalize ${
                              state.theme.bgMode === m
                                ? 'bg-cyan-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {m === 'solid' ? 'Color sólido' : m === 'gradient' ? 'Gradiente' : 'Imagen / URL'}
                          </button>
                        ))}
                      </div>
                      {state.theme.bgMode === 'solid' ? (
                        <ColorControl label="Color" value={state.theme.solidColor} onChange={(c) => dispatch({ type: 'THEME', patch: { solidColor: c } })} />
                      ) : null}
                      {state.theme.bgMode === 'gradient' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <ColorControl label="Color A" value={state.theme.gradientFrom} onChange={(c) => dispatch({ type: 'THEME', patch: { gradientFrom: c } })} />
                          <ColorControl label="Color B" value={state.theme.gradientTo} onChange={(c) => dispatch({ type: 'THEME', patch: { gradientTo: c } })} />
                          <div className="sm:col-span-2">
                            <label className="text-xs font-semibold text-slate-400">Ángulo: {state.theme.gradientAngle}°</label>
                            <input
                              type="range"
                              min={0}
                              max={360}
                              value={state.theme.gradientAngle}
                              onChange={(e) => dispatch({ type: 'THEME', patch: { gradientAngle: Number(e.target.value) } })}
                              className="mt-1 w-full accent-cyan-500"
                            />
                          </div>
                        </div>
                      ) : null}
                      {state.theme.bgMode === 'image' ? (
                        <div className="space-y-3">
                          <label className="block text-xs font-semibold text-slate-400">URL de imagen</label>
                          <input
                            value={state.theme.imageUrl}
                            onChange={(e) => dispatch({ type: 'THEME', patch: { imageUrl: e.target.value } })}
                            placeholder="https://…"
                            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
                          />
                          <label className="block text-xs font-semibold text-slate-400">O subir archivo</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setWallpaperFile(e.target.files?.[0] ?? null)}
                            className="w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:font-bold file:text-white"
                          />
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-400">Glass blur: {state.theme.glassBlur}px</label>
                          <input
                            type="range"
                            min={0}
                            max={32}
                            value={state.theme.glassBlur}
                            onChange={(e) => dispatch({ type: 'THEME', patch: { glassBlur: Number(e.target.value) } })}
                            className="mt-1 w-full accent-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400">Glass opacidad: {Math.round(state.theme.glassOpacity * 100)}%</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(state.theme.glassOpacity * 100)}
                            onChange={(e) => dispatch({ type: 'THEME', patch: { glassOpacity: Number(e.target.value) / 100 } })}
                            className="mt-1 w-full accent-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                  </Accordion>

                  <Accordion title="Botones / Links" icon={Layers}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ColorControl label="Fondo botón" value={state.theme.btnBg} onChange={(c) => dispatch({ type: 'THEME', patch: { btnBg: c } })} />
                      <ColorControl label="Borde botón" value={state.theme.btnBorder} onChange={(c) => dispatch({ type: 'THEME', patch: { btnBorder: c } })} />
                      <ColorControl label="Texto botón" value={state.theme.btnText} onChange={(c) => dispatch({ type: 'THEME', patch: { btnText: c } })} />
                      <ColorControl label="Acento secundario" value={state.theme.secondaryAccent} onChange={(c) => dispatch({ type: 'THEME', patch: { secondaryAccent: c } })} />
                    </div>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Border radius: {state.theme.btnRadius}px</label>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          value={state.theme.btnRadius}
                          onChange={(e) => dispatch({ type: 'THEME', patch: { btnRadius: Number(e.target.value) } })}
                          className="mt-1 w-full accent-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Border width: {state.theme.btnBorderWidth}px</label>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={state.theme.btnBorderWidth}
                          onChange={(e) => dispatch({ type: 'THEME', patch: { btnBorderWidth: Number(e.target.value) } })}
                          className="mt-1 w-full accent-cyan-500"
                        />
                      </div>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={state.theme.btnGlow}
                          onChange={(e) => dispatch({ type: 'THEME', patch: { btnGlow: e.target.checked } })}
                          className="h-4 w-4 rounded border-slate-500 accent-cyan-500"
                        />
                        <span className="text-sm font-bold text-slate-200">Sombra / glow neón</span>
                      </label>
                    </div>
                  </Accordion>

                  <Accordion title="Tipografía" icon={Type}>
                    <ColorControl label="Color texto general" value={state.theme.textColor} onChange={(c) => dispatch({ type: 'THEME', patch: { textColor: c } })} />
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'THEME', patch: { fontSource: 'google' } })}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold ${state.theme.fontSource === 'google' ? 'bg-cyan-600 text-white' : 'bg-slate-800'}`}
                      >
                        Google Fonts
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'THEME', patch: { fontSource: 'custom' } })}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold ${state.theme.fontSource === 'custom' ? 'bg-cyan-600 text-white' : 'bg-slate-800'}`}
                      >
                        Custom (Firestore)
                      </button>
                    </div>
                    {state.theme.fontSource === 'google' ? (
                      <select
                        value={state.theme.googleFont}
                        onChange={(e) => dispatch({ type: 'THEME', patch: { googleFont: e.target.value } })}
                        className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                      >
                        {GOOGLE_FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={state.theme.customFontId}
                        onChange={(e) => dispatch({ type: 'THEME', patch: { customFontId: e.target.value } })}
                        className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                      >
                        <option value="">— Elegir fuente —</option>
                        {fonts.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="mt-4">
                      <label className="text-xs font-semibold text-slate-400">Tamaño base: {state.theme.fontSizeBase}px</label>
                      <input
                        type="range"
                        min={10}
                        max={22}
                        value={state.theme.fontSizeBase}
                        onChange={(e) => dispatch({ type: 'THEME', patch: { fontSizeBase: Number(e.target.value) } })}
                        className="mt-1 w-full accent-cyan-500"
                      />
                    </div>
                  </Accordion>

                  <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Nombre del theme</label>
                    <input
                      required
                      value={state.theme.name}
                      onChange={(e) => dispatch({ type: 'THEME', patch: { name: e.target.value } })}
                      className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/25 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Guardar Theme
                    </button>
                  </div>
                </form>
              )}

              {state.tab === 'icons' && (
                <form className="space-y-4 pb-20" onSubmit={handleCreatePack}>
                  <Accordion title="Banco de iconos" icon={LayoutGrid} defaultOpen>
                    <input
                      required
                      value={state.iconPack.name}
                      onChange={(e) => dispatch({ type: 'ICON_PACK', patch: { name: e.target.value } })}
                      placeholder='Ej. "Minimalist Black"'
                      className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </Accordion>

                  <Accordion title="Diseño del pack" icon={Palette}>
                    <div className="space-y-4">
                      <ColorControl
                        label="Fondo contenedor icono"
                        value={state.iconPack.containerBg}
                        onChange={(c) => dispatch({ type: 'ICON_PACK', patch: { containerBg: c } })}
                      />
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Icon border radius: {state.iconPack.iconBorderRadius}px</label>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          value={state.iconPack.iconBorderRadius}
                          onChange={(e) => dispatch({ type: 'ICON_PACK', patch: { iconBorderRadius: Number(e.target.value) } })}
                          className="mt-1 w-full accent-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Icon size (preview): {state.iconPack.iconSize}px</label>
                        <input
                          type="range"
                          min={16}
                          max={64}
                          value={state.iconPack.iconSize}
                          onChange={(e) => dispatch({ type: 'ICON_PACK', patch: { iconSize: Number(e.target.value) } })}
                          className="mt-1 w-full accent-cyan-500"
                        />
                      </div>
                    </div>
                  </Accordion>

                  <Accordion title="Dropzone — arrastra 10–20 SVG/PNG" icon={Upload} defaultOpen>
                    <div
                      ref={dropRef}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDropActive(true);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragLeave={() => setDropActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropActive(false);
                        onDropFiles(e.dataTransfer.files);
                      }}
                      className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 transition ${
                        dropActive ? 'border-cyan-400 bg-cyan-950/40' : 'border-slate-600 bg-slate-900/50 hover:border-slate-500'
                      }`}
                    >
                      <Upload className="mb-2 h-10 w-10 text-cyan-500/80" />
                      <p className="text-center text-sm font-bold text-slate-300">Suelta archivos aquí</p>
                      <p className="mt-1 text-center text-xs text-slate-500">{state.iconPack.files.length} archivos</p>
                      <input
                        type="file"
                        multiple
                        accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml"
                        className="mt-4 w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:font-bold file:text-white"
                        onChange={(e) => onDropFiles(e.target.files)}
                      />
                    </div>
                  </Accordion>

                  <button
                    type="submit"
                    disabled={busy || !state.iconPack.files.length}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Forjar Icon Pack
                  </button>
                </form>
              )}

              {state.tab === 'skins' && (
                <form className="space-y-4 pb-20" onSubmit={handleForgeSkin}>
                  <Accordion title="Ensamblador" icon={Wand2} defaultOpen>
                    <label className="text-xs font-semibold text-slate-400">Theme Forge</label>
                    <select
                      required
                      value={state.skin.themeId}
                      onChange={(e) => dispatch({ type: 'SKIN', patch: { themeId: e.target.value } })}
                      className="mt-1 mb-3 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold"
                    >
                      <option value="">— Seleccionar —</option>
                      {themes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <label className="text-xs font-semibold text-slate-400">Icon Pack</label>
                    <select
                      required
                      value={state.skin.iconPackId}
                      onChange={(e) => dispatch({ type: 'SKIN', patch: { iconPackId: e.target.value } })}
                      className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold"
                    >
                      <option value="">— Seleccionar —</option>
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.icons.length})
                        </option>
                      ))}
                    </select>
                  </Accordion>

                  <Accordion title="Precios y nivel" icon={Diamond}>
                    <label className="text-xs font-semibold text-slate-400">Nombre del skin</label>
                    <input
                      required
                      value={state.skin.name}
                      onChange={(e) => dispatch({ type: 'SKIN', patch: { name: e.target.value } })}
                      className="mt-1 mb-3 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Precio CS Coins</label>
                        <input
                          type="number"
                          min={0}
                          value={state.skin.priceCoins}
                          onChange={(e) => dispatch({ type: 'SKIN', patch: { priceCoins: Number(e.target.value) || 0 } })}
                          className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Diamantes (USD)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={state.skin.priceDiamondsUsd}
                          onChange={(e) => dispatch({ type: 'SKIN', patch: { priceDiamondsUsd: Number(e.target.value) || 0 } })}
                          className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Nivel</label>
                        <select
                          value={state.skin.tier}
                          onChange={(e) => dispatch({ type: 'SKIN', patch: { tier: e.target.value as 'free' | 'premium' } })}
                          className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold"
                        >
                          <option value="free">Gratis</option>
                          <option value="premium">Premium</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400">Estado</label>
                        <select
                          value={state.skin.status}
                          onChange={(e) => dispatch({ type: 'SKIN', patch: { status: e.target.value as 'draft' | 'published' } })}
                          className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-semibold"
                        >
                          <option value="draft">Borrador</option>
                          <option value="published">Publicado</option>
                        </select>
                      </div>
                    </div>
                  </Accordion>

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 py-4 text-base font-black text-slate-950 shadow-xl shadow-orange-500/30 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                    FORJAR SKIN
                  </button>

                  <p className="text-center text-[11px] text-slate-500">
                    Skins: {skins.length} · Themes: {themes.length} · Packs: {packs.length}
                  </p>
                </form>
              )}
            </>
          )}
        </div>

        {/* Live Canvas 40% */}
        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <LiveCanvas tokens={previewTokens} />
        </div>
      </div>

      {toast ? (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-2xl border px-5 py-4 text-sm font-semibold shadow-2xl ${
            toast.type === 'success' ? 'border-emerald-700 bg-emerald-950 text-emerald-100' : 'border-red-700 bg-red-950 text-red-100'
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
