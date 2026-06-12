/**
 * LA FORJA — AI Visual Engine (admin)
 * Free AI actions with centralized reducer state and a live iPhone layout preview.
 */

import { HexColorInput } from 'react-colorful';
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  BrainCircuit,
  ChevronDown,
  CreditCard,
  Crown,
  Diamond,
  Folder,
  Handshake,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Package,
  Palette,
  Rocket,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Type,
  Upload,
  Wand,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ComponentType,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { useAdminT } from '../i18n/useAdminT';
import {
  analyzeBrandReference,
  generateAIWallpaper,
  generateAIIconsBatch,
  generateThemeLogic,
  type ExtractedBrandColors,
  type GeneratedThemeLogic,
  type IconShapeId,
  type IconStyleId,
} from '../services/aiStudioService';
import {
  createForgeIconPackDocument,
  getStudioFonts,
  listForgeIconPacksForStudio,
  listForgeSkinsForStudio,
  listStudioIconPacks,
  listStudioSkins,
  listStudioThemes,
  publishAdminStudioIcon,
  publishForgeSkinDocument,
  uploadFilesToDigitalOceanSpaces,
  type ForgeIconPackOption,
  type ForgeSkinListItem,
  type StudioFont,
  type StudioIconPackDoc,
  type StudioSkinDoc,
  type StudioThemeDoc,
} from '../services/studioService';

const GOOGLE_FONT_OPTIONS = [
  { id: 'Inter', label: 'Inter' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Space+Grotesk', label: 'Space Grotesk' },
  { id: 'DM+Sans', label: 'DM Sans' },
  { id: 'Outfit', label: 'Outfit' },
  { id: 'Sora', label: 'Sora' },
  { id: 'Manrope', label: 'Manrope' },
] as const;

const ICON_FOLDER_DEFAULTS = ['2D', '3D', 'Neon', 'Glass', 'Metal', 'Mascots'] as const;
const NEW_FOLDER_VALUE = '__create__';

const ICON_STYLE_OPTIONS: Array<{ id: IconStyleId; label: string }> = [
  { id: 'flat', label: 'Flat' },
  { id: '3d', label: '3D' },
  { id: 'neumorphism', label: 'Neumorfismo' },
  { id: 'minimalist', label: 'Minimalista' },
  { id: 'neon', label: 'Neon' },
  { id: 'hand-drawn', label: 'Hand-drawn' },
];

const ICON_SHAPE_OPTIONS: Array<{ id: IconShapeId; label: string }> = [
  { id: 'square', label: 'Cuadrado' },
  { id: 'rounded', label: 'Redondeado' },
  { id: 'circle', label: 'Circular' },
  { id: 'transparent', label: 'Transparente' },
];

const AI_ICON_GRADIENTS = [
  'from-cyan-300 via-blue-500 to-indigo-700',
  'from-orange-300 via-amber-500 to-rose-600',
  'from-fuchsia-300 via-violet-500 to-slate-950',
  'from-emerald-300 via-teal-500 to-cyan-800',
  'from-lime-200 via-green-500 to-zinc-950',
  'from-sky-200 via-cyan-500 to-blue-950',
  'from-pink-200 via-rose-500 to-red-900',
  'from-purple-200 via-indigo-500 to-blue-900',
  'from-yellow-100 via-orange-400 to-stone-900',
  'from-slate-100 via-slate-400 to-slate-900',
] as const;

type ForgeTab = 'icons' | 'packs' | 'skins' | 'layout';
type JustifyMode = 'flex-start' | 'center' | 'flex-end' | 'space-between';

type AiIconCandidate = {
  id: string;
  name: string;
  prompt: string;
  gradient: string;
  imageUrl?: string;
  seed: number;
};

type AiIconState = {
  // Wizard — paso 2: briefing textual
  brandContext: string;
  iconItems: string;
  count: number;
  style: IconStyleId;
  shape: IconShapeId;
  colorPrimary: string;
  colorSecondary: string;
  colorBackground: string;

  // Paso 1 — referencia visual
  referencePreview: string;
  referenceBase64: string;
  referenceMime: string;

  analyzingBrand: boolean;
  analyzingMessage: string;

  generating: boolean;
  generatingMessage: string;
  candidates: AiIconCandidate[];

  // Zone D — inspector & publish
  selectedId: string;
  uploadedFile: File | null;
  uploadedFilePreview: string;
  name: string;
  folder: string;
  newFolder: string;
  priceDiamonds: string;
  priceCoins: string;
  publishing: boolean;
};

type AiSkinState = {
  prompt: string;
  generating: boolean;
  skinLogoPreview: string;
  skinLogoBase64: string;
  skinLogoMime: string;
  analyzingBrand: boolean;
  analyzingMessage: string;
  name: string;
  priceUsd: string;
  priceCoins: number;
  wallpaperHex: string;
  labelsHex: string;
  vectorHex: string;
  wallpaperCss: string;
  wallpaperFile: File | null;
  wallpaperPreview: string;
  selectedIconPackId: string;
  fontSource: 'google' | 'custom';
  googleFont: string;
  customFontId: string;
};

type LayoutState = {
  columns: number;
  justify: JustifyMode;
  padding: number;
  gap: number;
};

type ForgeState = {
  tab: ForgeTab;
  icons: AiIconState;
  skin: AiSkinState;
  layout: LayoutState;
};

type ForgeAction =
  | { type: 'SET_TAB'; tab: ForgeTab }
  | { type: 'ICON_PATCH'; patch: Partial<AiIconState> }
  | { type: 'SKIN_PATCH'; patch: Partial<AiSkinState> }
  | { type: 'LAYOUT_PATCH'; patch: Partial<LayoutState> }
  | {
      type: 'SET_GENERATED_ICONS';
      candidates: AiIconCandidate[];
      suggestedName: string;
      suggestedPriceDiamonds: number;
      suggestedPriceCSCoins: number;
      extractedColors?: ExtractedBrandColors;
    }
  | { type: 'SELECT_ICON_CANDIDATE'; id: string }
  | { type: 'SET_UPLOADED_ICON'; file: File | null; preview: string }
  | { type: 'APPLY_THEME_LOGIC'; logic: GeneratedThemeLogic; wallpaperUrl: string };

const initialState: ForgeState = {
  tab: 'icons',
  icons: {
    brandContext: '',
    iconItems: '',
    count: 4,
    style: '3d',
    shape: 'rounded',
    colorPrimary: '#2F7BFF',
    colorSecondary: '#7A4DFF',
    colorBackground: '#071226',
    referencePreview: '',
    referenceBase64: '',
    referenceMime: 'image/png',
    analyzingBrand: false,
    analyzingMessage: '',
    generating: false,
    generatingMessage: '',
    candidates: [],
    selectedId: '',
    uploadedFile: null,
    uploadedFilePreview: '',
    name: '',
    folder: '3D',
    newFolder: '',
    priceDiamonds: '5',
    priceCoins: '500',
    publishing: false,
  },
  skin: {
    prompt: '',
    generating: false,
    skinLogoPreview: '',
    skinLogoBase64: '',
    skinLogoMime: 'image/png',
    analyzingBrand: false,
    analyzingMessage: '',
    name: 'Lone Star Voltage',
    priceUsd: '9.99',
    priceCoins: 1200,
    wallpaperHex: '#1a1a1a',
    labelsHex: '#f97316',
    vectorHex: '#ffffff',
    wallpaperCss: 'radial-gradient(circle at 20% 20%, #f97316 0 8%, transparent 32%), linear-gradient(145deg, #1a1a1a, #050505)',
    wallpaperFile: null,
    wallpaperPreview: '',
    selectedIconPackId: '',
    fontSource: 'google',
    googleFont: 'Space+Grotesk',
    customFontId: '',
  },
  layout: {
    columns: 4,
    justify: 'center',
    padding: 18,
    gap: 10,
  },
};

function titleCaseFromPrompt(prompt: string, fallback: string) {
  const words = prompt
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (!words.length) return fallback;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

async function readFileAsRawBase64(file: File): Promise<{ rawBase64: string; mimeType: string }> {
  const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen de referencia.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });

  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  if (index === -1) {
    throw new Error('La imagen de referencia no pudo convertirse a base64.');
  }

  return { rawBase64: dataUrl.slice(index + marker.length).trim(), mimeType };
}

function createIconCandidates(iconItems: string, brandContext: string): AiIconCandidate[] {
  const seedText = (iconItems || brandContext || '').trim();
  const base = titleCaseFromPrompt(seedText, 'AI Icon');
  return AI_ICON_GRADIENTS.map((gradient, index) => ({
    id: `ai-icon-${index + 1}`,
    name: `${base} ${String(index + 1).padStart(2, '0')}`,
    prompt: seedText || 'Iconos premium generados por IA',
    gradient,
    seed: index + 11,
  }));
}

const CARD_SOCIAL_MEDAL_ICONS = [Handshake, Star, ShieldCheck, Crown, Trophy] as const;

function cardSocialSubtitle(skin: AiSkinState): string {
  const raw = skin.prompt.replace(/\s+/g, ' ').trim();
  if (raw.length > 0) return raw.length > 52 ? `${raw.slice(0, 49)}…` : raw;
  return `USD ${skin.priceUsd} · ${skin.priceCoins} monedas`;
}

function fontLabelToGoogleId(fontFamily: string) {
  const normalized = fontFamily.trim().toLowerCase();
  return GOOGLE_FONT_OPTIONS.find((font) => font.label.toLowerCase() === normalized || font.id.toLowerCase() === normalized)?.id ?? 'Inter';
}

function alignmentToJustify(alignment: GeneratedThemeLogic['layoutAlignment']): JustifyMode {
  if (alignment === 'start') return 'flex-start';
  if (alignment === 'end') return 'flex-end';
  return 'center';
}

function alignmentToPadding(alignment: GeneratedThemeLogic['layoutAlignment']) {
  if (alignment === 'start') return 12;
  if (alignment === 'end') return 28;
  return 20;
}

function folderDocsToNames(packs: StudioIconPackDoc[], currentFolder: string, newFolder: string): string[] {
  const list: string[] = [];
  for (const pack of packs) {
    if (pack.name && pack.name.trim().length > 0) list.push(pack.name.trim());
  }
  if (currentFolder && currentFolder !== NEW_FOLDER_VALUE) list.push(currentFolder);
  if (newFolder && newFolder.trim().length > 0) list.push(newFolder.trim());
  return list;
}

function forgeReducer(state: ForgeState, action: ForgeAction): ForgeState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.tab };
    case 'ICON_PATCH':
      return { ...state, icons: { ...state.icons, ...action.patch } };
    case 'SKIN_PATCH':
      return { ...state, skin: { ...state.skin, ...action.patch } };
    case 'LAYOUT_PATCH':
      return { ...state, layout: { ...state.layout, ...action.patch } };
    case 'SET_GENERATED_ICONS': {
      const candidates = action.candidates;
      const colors = action.extractedColors;
      return {
        ...state,
        icons: {
          ...state.icons,
          generating: false,
          generatingMessage: '',
          candidates,
          selectedId: candidates[0]?.id ?? '',
          uploadedFile: null,
          uploadedFilePreview: '',
          name: action.suggestedName || candidates[0]?.name || '',
          priceDiamonds: String(action.suggestedPriceDiamonds),
          priceCoins: String(action.suggestedPriceCSCoins),
          ...(colors
            ? {
                colorPrimary: colors.primaryHex,
                colorSecondary: colors.secondaryHex,
                colorBackground: colors.bgHex,
              }
            : {}),
        },
      };
    }
    case 'SELECT_ICON_CANDIDATE': {
      const candidate = state.icons.candidates.find((entry) => entry.id === action.id);
      return {
        ...state,
        icons: {
          ...state.icons,
          selectedId: action.id,
          uploadedFile: null,
          uploadedFilePreview: '',
          name: state.icons.name || candidate?.name || '',
        },
      };
    }
    case 'SET_UPLOADED_ICON': {
      const baseName = action.file
        ? action.file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()
        : '';
      return {
        ...state,
        icons: {
          ...state.icons,
          uploadedFile: action.file,
          uploadedFilePreview: action.preview,
          name: state.icons.name || baseName,
        },
      };
    }
    case 'APPLY_THEME_LOGIC': {
      return {
        ...state,
        skin: {
          ...state.skin,
          generating: false,
          name: action.logic.name,
          priceUsd: action.logic.priceUSD.toFixed(2),
          priceCoins: action.logic.priceCoins,
          wallpaperHex: action.logic.wallpaperHex,
          labelsHex: action.logic.labelHex,
          vectorHex: action.logic.vectorHex,
          wallpaperCss: `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.18)), url("${action.wallpaperUrl}") center/cover no-repeat, ${action.logic.wallpaperHex}`,
          wallpaperFile: null,
          wallpaperPreview: '',
          fontSource: 'google',
          customFontId: '',
          googleFont: fontLabelToGoogleId(action.logic.fontFamily),
        },
        layout: {
          ...state.layout,
          justify: alignmentToJustify(action.logic.layoutAlignment),
          padding: alignmentToPadding(action.logic.layoutAlignment),
        },
      };
    }
    default:
      return state;
  }
}

function useGoogleFont(familyParam: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !familyParam) return;
    const id = `gf-admin-${familyParam}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;600;700;800&display=swap`;
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
    const fmt = /\.otf$/i.test(font.fileUrl) ? 'opentype' : 'truetype';
    el.textContent = `@font-face{font-family:'${font.family}';src:url('${font.fileUrl}') format('${fmt}');font-weight:400 800;font-style:normal;}`;
    document.head.appendChild(el);
    return () => el.remove();
  }, [font]);
}

function PanelCard({
  title,
  eyebrow,
  icon: Icon,
  children,
  defaultOpen = true,
  accentHex,
}: {
  title: string;
  eyebrow: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Acento de marca (ej. Labels del skin): borde izquierdo del panel */
  accentHex?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur ${
        accentHex ? 'border-l-4' : ''
      }`}
      style={accentHex ? { borderLeftColor: accentHex } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/20">
            <Icon size={20} />
          </span>
          <span>
            <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300/80">{eyebrow}</span>
            <span className="block text-base font-black text-white">{title}</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="p-5">{children}</div> : null}
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-500/10"
    />
  );
}

function MagicButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#2F7BFF]/30 bg-[#2F7BFF]/10 text-[#4D8FFF] shadow-lg shadow-[#2F7BFF]/10 transition hover:-translate-y-0.5 hover:bg-[#2F7BFF]/20"
    >
      <Wand className="h-5 w-5" />
    </button>
  );
}

function ColorPill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        <span className="h-5 w-5 rounded-full ring-2 ring-white/20" style={{ backgroundColor: value }} />
      </div>
      <HexColorInput
        prefixed
        color={value}
        onChange={onChange}
        className="w-full bg-transparent font-mono text-sm font-bold text-slate-100 outline-none"
      />
    </div>
  );
}

function IconArtwork({
  candidate,
  selected,
  hideSeed,
}: {
  candidate: AiIconCandidate;
  selected?: boolean;
  hideSeed?: boolean;
}) {
  const [mediaState, setMediaState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  useEffect(() => {
    if (!candidate.imageUrl) {
      setMediaState('idle');
      return;
    }
    setMediaState('loading');
  }, [candidate.imageUrl]);

  return (
    <div
      className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-[1.35rem] bg-gradient-to-br ${candidate.gradient} ${
        selected ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      {candidate.imageUrl ? (
        <>
          <img
            key={candidate.imageUrl}
            src={candidate.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={() => setMediaState('loaded')}
            onError={() => setMediaState('error')}
          />
          {mediaState === 'loading' ? (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
              aria-hidden
            >
              <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow-md" />
            </div>
          ) : null}
          {mediaState === 'error' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 px-2 text-center">
              <ImageIcon className="h-6 w-6 text-rose-200/90" aria-hidden />
              <span className="text-[9px] font-bold leading-tight text-rose-100">No se pudo cargar</span>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,.7),transparent_22%),radial-gradient(circle_at_78%_82%,rgba(0,0,0,.35),transparent_34%)]" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/35 bg-white/20 shadow-2xl backdrop-blur-md">
            <Sparkles className="h-7 w-7 text-white drop-shadow" />
          </div>
        </>
      )}
      {!hideSeed ? (
        <span className="absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-black text-white/90">
          {candidate.seed}
        </span>
      ) : null}
    </div>
  );
}

function CardSocialIconTile({
  candidate,
  selected,
  accent,
}: {
  candidate: AiIconCandidate;
  selected: boolean;
  accent: string;
}) {
  return (
    <div
      className="flex w-full min-w-0 flex-col items-center gap-1"
      style={
        selected
          ? {
              boxShadow: `0 0 0 2px ${accent}`,
              borderRadius: '0.9rem',
            }
          : undefined
      }
    >
      <div
        className="w-full overflow-hidden rounded-2xl border-2 bg-white"
        style={{ borderColor: accent, aspectRatio: '1' }}
      >
        <div className="h-full min-h-0 w-full overflow-hidden rounded-[0.65rem]">
          <IconArtwork candidate={candidate} hideSeed />
        </div>
      </div>
      <p
        className="w-full truncate px-0.5 text-center text-[8px] font-semibold leading-tight sm:text-[9px]"
        style={{ color: accent }}
        title={candidate.name}
      >
        {candidate.name}
      </p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none focus:ring-4 focus:ring-cyan-500/10"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AiIconPanel({
  state,
  dispatch,
  folderOptions,
  onAnalyzeBrand,
  onGenerateIcons,
  onUploadFile,
  onPublish,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
  folderOptions: string[];
  onAnalyzeBrand: () => void;
  onGenerateIcons: () => void;
  onUploadFile: (file: File | null) => void;
  onPublish: () => void;
}) {
  const ic = state.icons;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [referenceDragActive, setReferenceDragActive] = useState(false);
  const selectedCandidate = ic.candidates.find((candidate) => candidate.id === ic.selectedId) ?? null;
  const previewUrl = ic.uploadedFilePreview || selectedCandidate?.imageUrl || '';
  const previewLabel = ic.uploadedFile ? `Diseno propio · ${ic.uploadedFile.name}` : selectedCandidate?.name ?? 'Sin seleccion';
  const previewSource = ic.uploadedFile ? 'Archivo manual' : selectedCandidate ? 'Icono IA · tienda' : null;

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    onUploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) onUploadFile(file);
  };

  const pickReferenceFile = async (file: File | null) => {
    const prev = ic.referencePreview;
    if (!file) {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      dispatch({
        type: 'ICON_PATCH',
        patch: {
          referencePreview: '',
          referenceBase64: '',
          referenceMime: 'image/png',
        },
      });
      if (referenceInputRef.current) referenceInputRef.current.value = '';
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      if (referenceInputRef.current) referenceInputRef.current.value = '';
      return;
    }
    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    try {
      const { rawBase64, mimeType } = await readFileAsRawBase64(file);
      const preview = URL.createObjectURL(file);
      dispatch({
        type: 'ICON_PATCH',
        patch: {
          referencePreview: preview,
          referenceBase64: rawBase64,
          referenceMime: mimeType,
        },
      });
    } catch {
      dispatch({
        type: 'ICON_PATCH',
        patch: {
          referencePreview: '',
          referenceBase64: '',
          referenceMime: 'image/png',
        },
      });
    }
    if (referenceInputRef.current) referenceInputRef.current.value = '';
  };

  const handleReferenceInput = (event: ChangeEvent<HTMLInputElement>) => {
    void pickReferenceFile(event.target.files?.[0] ?? null);
  };

  const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setReferenceDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void pickReferenceFile(file);
  };

  return (
    <div className="space-y-5">
      <PanelCard title="AI Icon Lab" eyebrow="Wizard · 2 pasos" icon={BrainCircuit}>
        <div className="grid gap-6">
          <div className="rounded-[1.35rem] border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-950/25 via-slate-950/50 to-slate-950 p-5 shadow-lg shadow-fuchsia-950/20">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-500/30 text-sm font-black text-white shadow-inner shadow-fuchsia-500/40">
                  1
                </span>
                Analisis de marca
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gemini Vision · Flash</span>
            </div>

            <input
              ref={referenceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReferenceInput}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    referenceInputRef.current?.click();
                  }
                }}
                onDragEnter={() => setReferenceDragActive(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setReferenceDragActive(true);
                }}
                onDragLeave={() => setReferenceDragActive(false)}
                onDrop={handleReferenceDrop}
                className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-2xl border border-dashed px-4 py-3 transition ${
                  referenceDragActive
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/10'
                    : 'border-white/15 bg-white/[0.03] hover:border-white/25'
                }`}
                onClick={() => referenceInputRef.current?.click()}
              >
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
                  <ImageIcon className="h-4 w-4 shrink-0 text-fuchsia-300" />
                  Subir logo o imagen de referencia
                </div>
                <p className="text-[11px] font-semibold leading-snug text-slate-500">
                  Paso 1: solo analisis visual y extraccion de colores. Sin generar iconos todavia.
                </p>
              </div>
              {ic.referencePreview ? (
                <div className="relative shrink-0">
                  <img
                    src={ic.referencePreview}
                    alt="Referencia de marca"
                    className="h-16 w-16 rounded-xl border border-white/15 object-cover"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void pickReferenceFile(null);
                    }}
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-white shadow-lg transition hover:bg-rose-600"
                    aria-label="Quitar imagen de referencia"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>

            {ic.analyzingBrand ? (
              <div className="mt-4 space-y-2">
                <progress className="h-2 w-full overflow-hidden rounded-full accent-fuchsia-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full" />
                <p className="text-center text-xs font-semibold text-fuchsia-100/95">
                  {ic.analyzingMessage || 'Analizando imagen...'}
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onAnalyzeBrand}
              disabled={!ic.referenceBase64.trim() || ic.analyzingBrand}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/15 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-fuchsia-100 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ic.analyzingBrand ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
              1. Analizar identidad de marca
            </button>
          </div>

          <div className="rounded-[1.35rem] border border-cyan-500/25 bg-gradient-to-br from-cyan-950/20 via-slate-950/50 to-slate-950 p-5 shadow-lg shadow-cyan-950/15">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/30 text-sm font-black text-white shadow-inner shadow-cyan-500/40">
                  2
                </span>
                Generacion de iconos
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gemini + Vertex Imagen</span>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <FieldLabel>Contexto / tema detectado</FieldLabel>
                <textarea
                  value={ic.brandContext}
                  onChange={(event) => dispatch({ type: 'ICON_PATCH', patch: { brandContext: event.target.value } })}
                  rows={3}
                  placeholder="Editable: pega o ajusta el contexto de marca (se rellena al analizar el logo, o escribelo a mano)."
                  className="w-full resize-y rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-600 focus:ring-4 focus:ring-cyan-500/15"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Elementos a dibujar</FieldLabel>
                <TextInput
                  value={ic.iconItems}
                  onChange={(iconItems) => dispatch({ type: 'ICON_PATCH', patch: { iconItems } })}
                  placeholder='Ej. "pelota, camiseta, hincha, telefono"'
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Estilo"
                  value={ic.style}
                  onChange={(value) => dispatch({ type: 'ICON_PATCH', patch: { style: value as IconStyleId } })}
                  options={ICON_STYLE_OPTIONS}
                />
                <SelectField
                  label="Forma del contenedor"
                  value={ic.shape}
                  onChange={(value) => dispatch({ type: 'ICON_PATCH', patch: { shape: value as IconShapeId } })}
                  options={ICON_SHAPE_OPTIONS}
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Cantidad</FieldLabel>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={ic.count}
                    onChange={(event) => {
                      const next = Math.max(1, Math.min(10, Math.round(Number(event.target.value)) || 1));
                      dispatch({ type: 'ICON_PATCH', patch: { count: next } });
                    }}
                    className="w-16 bg-transparent text-center text-base font-black text-white outline-none"
                  />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">/10 iconos</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <ColorPill
                  label="Principal"
                  value={ic.colorPrimary}
                  onChange={(colorPrimary) => dispatch({ type: 'ICON_PATCH', patch: { colorPrimary } })}
                />
                <ColorPill
                  label="Secundario"
                  value={ic.colorSecondary}
                  onChange={(colorSecondary) => dispatch({ type: 'ICON_PATCH', patch: { colorSecondary } })}
                />
                <ColorPill
                  label="Fondo"
                  value={ic.colorBackground}
                  onChange={(colorBackground) => dispatch({ type: 'ICON_PATCH', patch: { colorBackground } })}
                />
              </div>
            </div>

            {ic.generating ? (
              <div className="mt-4 space-y-2">
                <progress className="h-2 w-full overflow-hidden rounded-full accent-cyan-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full" />
                <p className="text-center text-xs font-semibold text-cyan-100/95">
                  {ic.generatingMessage || 'Generando...'}
                </p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onGenerateIcons}
              disabled={ic.generating}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 px-5 py-4 text-sm font-black uppercase tracking-[0.15em] text-white shadow-xl shadow-fuchsia-500/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ic.generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand className="h-5 w-5" />}
              2. Generar {ic.count} iconos
            </button>
          </div>
        </div>
      </PanelCard>

      <div
        className="rounded-2xl border px-4 py-3.5 text-left text-xs leading-relaxed"
        style={{
          borderColor: `${state.skin.labelsHex}66`,
          background: `linear-gradient(125deg, ${state.skin.labelsHex}18 0%, rgba(15,23,42,0.92) 52%, transparent 100%)`,
        }}
      >
        <p className="font-black uppercase tracking-[0.14em] text-slate-400">Esto no sustituye tu tarjeta sola</p>
        <p className="mt-2 text-slate-300">
          <strong className="text-white">Zone C y Zone D</strong> sirven para producir y publicar{' '}
          <strong className="text-white">un icono suelto</strong> en la tienda (PNG en un pack). No es el mock completo del perfil Card-Social.
        </p>
        <p className="mt-2 text-slate-300">
          La tarjeta con <strong className="text-white">avatar, titulo, medallas y bloque de iconos</strong> esta en la{' '}
          <strong className="text-white">columna derecha</strong>. El asistente de marca esta arriba: expande <strong className="text-white">AI Icon Lab</strong> si lo
          cerraste; ahi estan el <strong className="text-white">Paso 1</strong> (logo) y <strong className="text-white">Paso 2</strong> (contexto + generar).
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          Si el titular del tile no coincide con el nombre comercial, ajusta contexto o elementos en el paso 2, o edita el nombre antes de publicar. Vertex Imagen usa el
          prompt en ingles que devuelve Gemini.
        </p>
      </div>

      <PanelCard
        title="Cuadricula de Resultados"
        eyebrow="Zone C · Gallery"
        icon={LayoutGrid}
        accentHex={state.skin.labelsHex}
      >
        {ic.analyzingBrand || ic.generating ? (
          <div className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
            <progress className="h-1.5 w-full overflow-hidden rounded-full accent-cyan-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full" />
            <p className="text-center text-[11px] font-semibold text-slate-400">
              {ic.analyzingMessage || ic.generatingMessage || 'En curso...'}
            </p>
          </div>
        ) : null}
        {ic.candidates.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-950/60 px-4 py-8 text-center text-xs font-bold text-slate-500">
            Completa el paso 2 para ver la cuadricula. Cada tile muestra un spinner hasta que Vertex AI termina de generar el PNG.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
            {ic.candidates.map((candidate) => {
              const isSelected = ic.selectedId === candidate.id && !ic.uploadedFile;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => dispatch({ type: 'SELECT_ICON_CANDIDATE', id: candidate.id })}
                  className={`group rounded-[1.6rem] border bg-slate-950/60 p-2 text-left transition hover:-translate-y-1 ${
                    isSelected ? 'border-cyan-300/60 shadow-lg shadow-cyan-500/20' : 'border-white/10 hover:border-cyan-300/40'
                  }`}
                >
                  <IconArtwork candidate={candidate} selected={isSelected} />
                  <p className="mt-2 truncate px-1 text-xs font-bold text-slate-300">{candidate.name}</p>
                </button>
              );
            })}
          </div>
        )}
      </PanelCard>

      <PanelCard
        title="Inspector & Uploader Manual"
        eyebrow="Zone D · Publish"
        icon={Layers}
        accentHex={state.skin.labelsHex}
      >
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[1.8rem] border-2 border-dashed bg-slate-950/60 p-4 text-center transition ${
              dragActive ? 'border-cyan-300 bg-cyan-950/40' : 'border-white/15'
            }`}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt={previewLabel} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg backdrop-blur">
                  <span className="truncate">{previewSource}</span>
                  {ic.uploadedFile ? (
                    <button
                      type="button"
                      onClick={() => onUploadFile(null)}
                      className="rounded-full bg-white/15 p-1 text-white hover:bg-white/30"
                      title="Quitar archivo subido"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Upload className="h-8 w-8" />
                <p className="text-xs font-black uppercase tracking-[0.2em]">Arrastra o sube</p>
                <p className="text-[10px] font-semibold">Selecciona uno generado o sube tu propio diseno</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp"
              onChange={handleFileInput}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Subir diseno propio"
            />
          </div>

          <div className="grid gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/10"
            >
              <Upload className="h-4 w-4" />
              Subir Diseno Propio (.PNG / .SVG)
            </button>

            <div className="space-y-2">
              <FieldLabel>Nombre del Icono</FieldLabel>
              <TextInput
                value={ic.name}
                onChange={(name) => dispatch({ type: 'ICON_PATCH', patch: { name } })}
                placeholder="Autocompletado por Gemini"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Asignar a Grupo / Carpeta</FieldLabel>
              <select
                value={ic.folder}
                onChange={(event) => {
                  const next = event.target.value;
                  dispatch({
                    type: 'ICON_PATCH',
                    patch: { folder: next, newFolder: next === NEW_FOLDER_VALUE ? '' : ic.newFolder },
                  });
                }}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none focus:ring-4 focus:ring-cyan-500/10"
              >
                {folderOptions.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
                <option value={NEW_FOLDER_VALUE}>+ Crear Nueva Carpeta...</option>
              </select>
              {ic.folder === NEW_FOLDER_VALUE ? (
                <div className="flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-500/5 px-3 py-2">
                  <Folder className="h-4 w-4 text-cyan-300" />
                  <input
                    autoFocus
                    value={ic.newFolder}
                    onChange={(event) => dispatch({ type: 'ICON_PATCH', patch: { newFolder: event.target.value } })}
                    placeholder="Nombre de la nueva carpeta"
                    className="w-full bg-transparent text-sm font-bold text-cyan-100 outline-none placeholder:text-cyan-300/40"
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Precio (Diamantes)</FieldLabel>
                <TextInput
                  type="number"
                  value={ic.priceDiamonds}
                  onChange={(priceDiamonds) => dispatch({ type: 'ICON_PATCH', patch: { priceDiamonds } })}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Precio (CS Coins)</FieldLabel>
                <TextInput
                  type="number"
                  value={ic.priceCoins}
                  onChange={(priceCoins) => dispatch({ type: 'ICON_PATCH', patch: { priceCoins } })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onPublish}
              disabled={ic.publishing}
              className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-6 py-5 text-base font-black uppercase tracking-[0.22em] text-slate-950 shadow-2xl shadow-emerald-500/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ic.publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
              Publicar en la Tienda
            </button>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

type ToastState = { kind: 'success' | 'error'; message: string };

function IconPacksBulkPanel({
  currentUser,
  onToast,
  onSaved,
}: {
  currentUser: { uid?: string; email?: string | null } | null;
  onToast: (toast: ToastState) => void;
  onSaved: () => void;
}) {
  const { t } = useAdminT();
  const [files, setFiles] = useState<File[]>([]);
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [packName, setPackName] = useState('');
  const [priceUsd, setPriceUsd] = useState('12.99');
  const [priceCs, setPriceCs] = useState('750');
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setObjectUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).filter((f) => /\.(png|svg)$/i.test(f.name));
    if (!next.length) {
      onToast({ kind: 'error', message: t('admin_studio_pack_png_svg_only') });
      return;
    }
    setFiles((prev) => [...prev, ...next].slice(0, 24));
  }, [onToast, t]);

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    const name = packName.trim();
    if (!name) {
      onToast({ kind: 'error', message: t('admin_studio_pack_name_required') });
      return;
    }
    if (files.length < 1) {
      onToast({ kind: 'error', message: t('admin_studio_pack_files_count') });
      return;
    }
    setSaving(true);
    try {
      const urls = await uploadFilesToDigitalOceanSpaces(files);
      const icons = urls.map((url, index) => ({ url, fileName: files[index]?.name || `icon-${index}.png` }));
      await createForgeIconPackDocument({
        name,
        priceUsd: Number(priceUsd) || 0,
        creditsPrice: Number(priceCs) || 0,
        icons,
        createdBy: currentUser?.uid,
        createdByEmail: currentUser?.email ?? null,
      });
      setFiles([]);
      setPackName('');
      onToast({
        kind: 'success',
        message: t('admin_studio_pack_saved', { name, count: String(icons.length) }),
      });
      onSaved();
    } catch (error) {
      console.error('[IconPacksBulkPanel]', error);
      onToast({ kind: 'error', message: t('admin_err_save_general') });
    } finally {
      setSaving(false);
    }
  }, [files, packName, priceUsd, priceCs, currentUser, onToast, onSaved, t]);

  return (
    <div className="space-y-5">
      <PanelCard title="Icon Packs · DO Spaces" eyebrow="Carga masiva 15–20 assets" icon={Package}>
        <p className="mb-4 text-xs font-semibold leading-relaxed text-slate-400">
          Arrastra PNG/SVG; el servidor los sube con ACL pública. Las llaves de Spaces nunca pasan por Vite: solo{' '}
          <span className="text-cyan-200">POST /api/upload-spaces</span> en Express.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".png,.svg,image/png,image/svg+xml"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={() => setDragOver(true)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            addFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`mb-5 cursor-pointer rounded-[1.5rem] border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? 'border-cyan-300/70 bg-cyan-500/10' : 'border-white/15 bg-slate-950/50 hover:border-white/25'
          }`}
        >
          <Upload className="mx-auto mb-3 h-10 w-10 text-slate-500" />
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-200">Arrastra y suelta (masivo)</p>
          <p className="mt-2 text-xs text-slate-500">.png / .svg · hasta 24 archivos · max ~30MB c/u</p>
        </div>

        {files.length > 0 ? (
          <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}-${file.size}`}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-slate-900"
              >
                <img src={objectUrls[index]} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeAt(index);
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-600"
                  aria-label="Quitar archivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                  {file.name}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-5 text-center text-xs font-semibold text-slate-600">Aún no hay archivos en esta tanda.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <FieldLabel>Nombre del Pack</FieldLabel>
            <TextInput value={packName} onChange={setPackName} placeholder="Ej. NFL Sunday Elite" />
          </div>
          <div className="space-y-2">
            <FieldLabel>Precio USD</FieldLabel>
            <TextInput type="number" value={priceUsd} onChange={setPriceUsd} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Precio CS (créditos)</FieldLabel>
            <TextInput type="number" value={priceCs} onChange={setPriceCs} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || files.length < 1}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-fuchsia-500/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
          {t('admin_studio_btn_save_pack_catalog')}
        </button>
      </PanelCard>
    </div>
  );
}

function AiSkinPanel({
  state,
  dispatch,
  fonts,
  forgePacks,
  onAnalyzeSkinBrand,
  onGenerateSkinAi,
  onForgeSkinPersist,
  skinForgeSaving,
  t,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
  fonts: StudioFont[];
  forgePacks: ForgeIconPackOption[];
  onAnalyzeSkinBrand: () => void;
  onGenerateSkinAi: () => void;
  onForgeSkinPersist: () => void;
  skinForgeSaving: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const skinLogoInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [logoDrag, setLogoDrag] = useState(false);
  const [wallDrag, setWallDrag] = useState(false);
  const sk = state.skin;

  const skinBackdrop =
    sk.wallpaperPreview && sk.wallpaperPreview.length > 0
      ? `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.18)), url("${sk.wallpaperPreview}") center/cover no-repeat, ${sk.wallpaperHex}`
      : sk.wallpaperCss || sk.wallpaperHex;

  const pickSkinLogo = useCallback(
    async (file: File | null) => {
      if (!file) {
        dispatch({
          type: 'SKIN_PATCH',
          patch: { skinLogoPreview: '', skinLogoBase64: '', skinLogoMime: 'image/png' },
        });
        return;
      }
      if (skinLogoInputRef.current) skinLogoInputRef.current.value = '';
      const preview = URL.createObjectURL(file);
      try {
        const { rawBase64, mimeType } = await readFileAsRawBase64(file);
        dispatch({
          type: 'SKIN_PATCH',
          patch: { skinLogoPreview: preview, skinLogoBase64: rawBase64, skinLogoMime: mimeType },
        });
      } catch {
        URL.revokeObjectURL(preview);
        dispatch({
          type: 'SKIN_PATCH',
          patch: { skinLogoPreview: '', skinLogoBase64: '', skinLogoMime: 'image/png' },
        });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    const preview = sk.skinLogoPreview;
    if (!preview || !preview.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(preview);
  }, [sk.skinLogoPreview]);

  const onWallpaperPick = useCallback(
    (file: File | null) => {
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
      if (!file) {
        dispatch({ type: 'SKIN_PATCH', patch: { wallpaperFile: null, wallpaperPreview: '' } });
        return;
      }
      if (!/\.(png|svg|jpe?g|webp)$/i.test(file.name)) {
        return;
      }
      const preview = URL.createObjectURL(file);
      dispatch({ type: 'SKIN_PATCH', patch: { wallpaperFile: file, wallpaperPreview: preview } });
    },
    [dispatch],
  );

  useEffect(() => {
    const preview = sk.wallpaperPreview;
    if (!preview || !preview.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(preview);
  }, [sk.wallpaperPreview]);

  return (
    <div className="space-y-5">
      <PanelCard title="Gemini Vision · Skin" eyebrow="Fase 1 · Marca" icon={ScanLine}>
        <input
          ref={skinLogoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void pickSkinLogo(event.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap items-start gap-3">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                skinLogoInputRef.current?.click();
              }
            }}
            onDragEnter={() => setLogoDrag(true)}
            onDragOver={(event) => {
              event.preventDefault();
              setLogoDrag(true);
            }}
            onDragLeave={() => setLogoDrag(false)}
            onDrop={(event) => {
              event.preventDefault();
              setLogoDrag(false);
              void pickSkinLogo(event.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => skinLogoInputRef.current?.click()}
            className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-2xl border border-dashed px-4 py-3 transition ${
              logoDrag ? 'border-fuchsia-400/60 bg-fuchsia-500/10' : 'border-white/15 bg-white/[0.03]'
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
              <ImageIcon className="h-4 w-4 text-fuchsia-300" />
              Subir imagen de referencia (logo)
            </span>
            <p className="text-[11px] font-semibold text-slate-500">
              Misma idea que en Iconos: extraemos HEX para fondo, acentos y texto.
            </p>
          </div>
          {sk.skinLogoPreview ? (
            <div className="relative shrink-0">
              <img src={sk.skinLogoPreview} alt="" className="h-16 w-16 rounded-xl border border-white/15 object-cover" />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void pickSkinLogo(null);
                }}
                className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-slate-950 text-white hover:bg-rose-600"
                aria-label="Quitar referencia"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        {sk.analyzingBrand ? (
          <div className="mt-4 space-y-2">
            <progress className="h-2 w-full overflow-hidden rounded-full accent-fuchsia-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full" />
            <p className="text-center text-xs font-semibold text-fuchsia-100/90">
              {sk.analyzingMessage || 'Analizando...'}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onAnalyzeSkinBrand}
          disabled={!sk.skinLogoBase64.trim() || sk.analyzingBrand}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/35 bg-fuchsia-500/15 px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-fuchsia-100 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sk.analyzingBrand ? <Loader2 className="h-5 w-5 animate-spin" /> : <BrainCircuit className="h-5 w-5" />}
          Analizar Marca
        </button>
      </PanelCard>

      <PanelCard title="El Master Builder" eyebrow="AI Skin Forge" icon={Diamond}>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
          <TextInput
            value={sk.prompt}
            onChange={(prompt) => dispatch({ type: 'SKIN_PATCH', patch: { prompt } })}
            placeholder="Describe el Skin (ej. Colores Texas Longhorns, sans-serif)"
          />
          <button
            type="button"
            onClick={onGenerateSkinAi}
            disabled={sk.generating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4D8FFF] via-[#2F7BFF] to-[#7A4DFF] px-5 py-3 text-sm font-black text-white shadow-xl shadow-[#2F7BFF]/25 transition hover:-translate-y-0.5"
          >
            {sk.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand className="h-4 w-4" />}
            Sugerir Skin con IA
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <ColorPill
            label="Fondo (wallpaper hex)"
            value={sk.wallpaperHex}
            onChange={(wallpaperHex) => dispatch({ type: 'SKIN_PATCH', patch: { wallpaperHex } })}
          />
          <ColorPill
            label="Botones / labels"
            value={sk.labelsHex}
            onChange={(labelsHex) => dispatch({ type: 'SKIN_PATCH', patch: { labelsHex } })}
          />
          <ColorPill
            label="Textos / vector"
            value={sk.vectorHex}
            onChange={(vectorHex) => dispatch({ type: 'SKIN_PATCH', patch: { vectorHex } })}
          />
        </div>
      </PanelCard>

      <PanelCard title="Wallpaper a Spaces" eyebrow="Archivo final" icon={ImageIcon}>
        <input
          ref={wallpaperInputRef}
          type="file"
          accept=".png,.svg,.jpg,.jpeg,.webp,image/*"
          className="hidden"
          onChange={(event) => onWallpaperPick(event.target.files?.[0] ?? null)}
        />
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              wallpaperInputRef.current?.click();
            }
          }}
          onDragEnter={() => setWallDrag(true)}
          onDragOver={(event) => {
            event.preventDefault();
            setWallDrag(true);
          }}
          onDragLeave={() => setWallDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            setWallDrag(false);
            onWallpaperPick(event.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => wallpaperInputRef.current?.click()}
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 transition ${
            wallDrag ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/15 bg-slate-950/50'
          }`}
        >
          <Upload className="h-8 w-8 text-slate-500" />
          <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">Wallpaper → POST /api/upload-spaces</p>
          {sk.wallpaperFile ? (
            <p className="mt-2 truncate text-[11px] font-semibold text-cyan-200/90">{sk.wallpaperFile.name}</p>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard title={t('admin_studio_panel_pack_title')} eyebrow={t('admin_studio_panel_pack_eyebrow')} icon={Layers}>
        <FieldLabel>Elegir pack (creado en pestaña Icon Packs)</FieldLabel>
        <select
          value={sk.selectedIconPackId}
          onChange={(event) => dispatch({ type: 'SKIN_PATCH', patch: { selectedIconPackId: event.target.value } })}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none"
        >
          <option value="">Selecciona un pack…</option>
          {forgePacks.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name} ({pack.iconUrls.length} urls)
            </option>
          ))}
        </select>
        {forgePacks.length === 0 ? (
          <p className="mt-3 text-xs text-amber-200/80">{t('admin_studio_panel_pack_empty')}</p>
        ) : null}
      </PanelCard>

      <PanelCard title="Naming, Precio y Tipografia" eyebrow="Commercial AI" icon={Type}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>Nombre</FieldLabel>
            <div className="flex gap-2">
              <TextInput value={sk.name} onChange={(name) => dispatch({ type: 'SKIN_PATCH', patch: { name } })} />
              <MagicButton
                label="Sugerir nombre"
                onClick={() =>
                  dispatch({
                    type: 'SKIN_PATCH',
                    patch: { name: `${titleCaseFromPrompt(sk.prompt, 'Forge Skin')} Pro` },
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>Precio (USD)</FieldLabel>
            <div className="flex gap-2">
              <TextInput
                type="number"
                value={sk.priceUsd}
                onChange={(priceUsd) => dispatch({ type: 'SKIN_PATCH', patch: { priceUsd } })}
              />
              <MagicButton label="Sugerir precio" onClick={() => dispatch({ type: 'SKIN_PATCH', patch: { priceUsd: '14.99' } })} />
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>Precio (Coins)</FieldLabel>
            <TextInput
              type="number"
              value={String(sk.priceCoins)}
              onChange={(priceCoins) =>
                dispatch({
                  type: 'SKIN_PATCH',
                  patch: { priceCoins: Math.max(0, Math.round(Number(priceCoins) || 0)) },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Fuente del Skin</FieldLabel>
            <select
              value={sk.fontSource}
              onChange={(event) =>
                dispatch({
                  type: 'SKIN_PATCH',
                  patch: { fontSource: event.target.value as AiSkinState['fontSource'] },
                })
              }
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none"
            >
              <option value="google">Google Font</option>
              <option value="custom">Font Uploader</option>
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel>{sk.fontSource === 'custom' ? 'Font Uploader' : 'Google Font'}</FieldLabel>
            {sk.fontSource === 'custom' ? (
              <select
                value={sk.customFontId}
                onChange={(event) => dispatch({ type: 'SKIN_PATCH', patch: { customFontId: event.target.value } })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none"
              >
                <option value="">Seleccionar fuente subida</option>
                {fonts.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={sk.googleFont}
                onChange={(event) => dispatch({ type: 'SKIN_PATCH', patch: { googleFont: event.target.value } })}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none"
              >
                {GOOGLE_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </PanelCard>

      <PanelCard title={t('admin_studio_panel_assembly_title')} eyebrow={t('admin_studio_panel_assembly_eyebrow')} icon={Rocket}>
        <button
          type="button"
          onClick={onForgeSkinPersist}
          disabled={skinForgeSaving || !sk.wallpaperFile || !sk.selectedIconPackId || !sk.name.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-6 py-5 text-base font-black uppercase tracking-[0.2em] text-slate-950 shadow-2xl shadow-emerald-500/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {skinForgeSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          Forjar Skin
        </button>
        <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">{t('admin_studio_panel_assembly_desc')}</p>
      </PanelCard>

      <PanelCard title="Wallpaper preview" eyebrow="Mock Render" icon={ImageIcon}>
        <div
          className="min-h-[180px] rounded-[2rem] border border-white/10 shadow-2xl shadow-black/30"
          style={{ background: skinBackdrop }}
        />
      </PanelCard>
    </div>
  );
}

function LayoutPanel({
  state,
  dispatch,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
}) {
  const justifyOptions: Array<{ value: JustifyMode; label: string; icon: ComponentType<{ className?: string }> }> = [
    { value: 'flex-start', label: 'Start', icon: AlignHorizontalJustifyStart },
    { value: 'center', label: 'Center', icon: AlignHorizontalJustifyCenter },
    { value: 'flex-end', label: 'End', icon: AlignHorizontalJustifyEnd },
    { value: 'space-between', label: 'Space-between', icon: AlignHorizontalSpaceBetween },
  ];

  return (
    <div className="space-y-5">
      <PanelCard title="Layout Controls" eyebrow="FlutterFlow Style" icon={LayoutGrid}>
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Alineacion de Iconos</FieldLabel>
              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-200">
                Grid {state.layout.columns}/12
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              value={state.layout.columns}
              onChange={(event) => dispatch({ type: 'LAYOUT_PATCH', patch: { columns: Number(event.target.value) } })}
              className="w-full accent-cyan-400"
            />
            <div className="mt-3 grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => dispatch({ type: 'LAYOUT_PATCH', patch: { columns: index + 1 } })}
                  className={`h-8 rounded-lg border text-[10px] font-black ${
                    index < state.layout.columns
                      ? 'border-cyan-300/40 bg-cyan-400/20 text-cyan-100'
                      : 'border-white/10 bg-slate-950 text-slate-600'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Flexbox visual</FieldLabel>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {justifyOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => dispatch({ type: 'LAYOUT_PATCH', patch: { justify: value } })}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition ${
                    state.layout.justify === value
                      ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100'
                      : 'border-white/10 bg-slate-950/70 text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel>Padding</FieldLabel>
                <span className="text-xs font-black text-slate-300">{state.layout.padding}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                value={state.layout.padding}
                onChange={(event) => dispatch({ type: 'LAYOUT_PATCH', patch: { padding: Number(event.target.value) } })}
                className="w-full accent-cyan-400"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel>Gap</FieldLabel>
                <span className="text-xs font-black text-slate-300">{state.layout.gap}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                value={state.layout.gap}
                onChange={(event) => dispatch({ type: 'LAYOUT_PATCH', patch: { gap: Number(event.target.value) } })}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

function LivePreview({
  state,
  fonts,
  activeTab = 'icons',
}: {
  state: ForgeState;
  fonts: StudioFont[];
  activeTab?: ForgeTab;
}) {
  const customFont = state.skin.customFontId ? fonts.find((font) => font.id === state.skin.customFontId) ?? null : null;
  const fontFamily =
    state.skin.fontSource === 'custom' && customFont
      ? `'${customFont.family}', system-ui, sans-serif`
      : `'${state.skin.googleFont.replace(/\+/g, ' ')}', system-ui, sans-serif`;

  const accent = state.skin.labelsHex;

  const skinBackdrop =
    state.skin.wallpaperPreview && state.skin.wallpaperPreview.length > 0
      ? `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.18)), url("${state.skin.wallpaperPreview}") center/cover no-repeat, ${state.skin.wallpaperHex}`
      : state.skin.wallpaperCss || state.skin.wallpaperHex;

  const previewIconSet =
    state.icons.candidates.length > 0
      ? state.icons.candidates
      : createIconCandidates(state.icons.iconItems, state.icons.brandContext).slice(0, Math.max(state.icons.count, 6));

  const gridJustifyItems =
    state.layout.justify === 'flex-start'
      ? 'start'
      : state.layout.justify === 'flex-end'
        ? 'end'
        : state.layout.justify === 'center'
          ? 'center'
          : 'stretch';

  return (
    <aside className="relative flex min-h-[760px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#0f172a_0,#020617_55%)] px-4 py-10">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
      <div className="relative w-full max-w-[360px]">
        {activeTab === 'icons' ? (
          <p className="mb-3 rounded-2xl border border-white/10 bg-slate-900/50 px-3.5 py-2.5 text-[11px] font-semibold leading-snug text-slate-400">
            Desde <span className="text-slate-200">Iconos AI</span>: la cuadricula de la izquierda son assets para la{' '}
            <span className="text-slate-200">tienda</span>. Aqui ves como quedan incorporados en la{' '}
            <span className="text-slate-200">tarjeta Card-Social</span> (seccion Iconos).
          </p>
        ) : null}
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur-md">
          <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
            <CreditCard className="h-4 w-4 shrink-0" style={{ color: accent }} />
            Vista previa Card-Social
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black text-slate-400">Modal</span>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-5">
          <div
            className="rounded-[1.35rem] border-[3px] bg-white px-4 pb-5 pt-4 shadow-inner sm:px-5"
            style={{ borderColor: accent, fontFamily }}
          >
            <div className="mb-4 flex items-center justify-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 bg-slate-50"
                style={{ borderColor: accent }}
              >
                <CreditCard className="h-4 w-4" style={{ color: accent }} strokeWidth={2.2} />
              </div>
              <span className="text-sm font-bold" style={{ color: accent }}>
                Card-Social
              </span>
            </div>

            <div
              className="mx-auto mb-4 h-[5.5rem] w-[5.5rem] overflow-hidden rounded-[1.35rem] border-[3px] shadow-sm sm:h-28 sm:w-28 sm:rounded-[1.5rem]"
              style={{
                borderColor: accent,
                background: skinBackdrop,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            <h2
              className="mb-1 text-center text-xl font-bold leading-snug text-balance sm:text-2xl"
              style={{ color: accent }}
            >
              {state.skin.name || 'Nombre de la tarjeta'}
            </h2>
            <p
              className="mx-auto mb-5 max-w-[280px] text-center text-xs font-medium leading-relaxed text-balance opacity-80 sm:text-sm"
              style={{ color: accent }}
            >
              {cardSocialSubtitle(state.skin)}
            </p>

            <div
              className="mb-5 flex items-center justify-between gap-0.5 rounded-full border-2 bg-white px-1.5 py-2 sm:gap-1 sm:px-3 sm:py-2.5"
              style={{ borderColor: accent }}
            >
              {CARD_SOCIAL_MEDAL_ICONS.map((Icon, index) => (
                <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                  <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" style={{ color: accent }} strokeWidth={2} />
                  <span className="text-[9px] font-bold tabular-nums sm:text-[10px]" style={{ color: accent }}>
                    0
                  </span>
                </div>
              ))}
            </div>

            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: accent }}>
              Iconos
            </p>
            <div
              className="grid w-full min-w-0"
              style={{
                gridTemplateColumns: `repeat(${state.layout.columns}, minmax(0, 1fr))`,
                gap: state.layout.gap,
                padding: state.layout.padding,
                justifyItems: gridJustifyItems,
              }}
            >
              {previewIconSet.map((candidate) => (
                <CardSocialIconTile
                  key={candidate.id}
                  candidate={candidate}
                  selected={state.icons.selectedId === candidate.id}
                  accent={accent}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <div
              className="flex flex-1 select-none items-center justify-center rounded-full bg-slate-700 py-3 text-center text-xs font-bold text-white shadow-lg"
              role="presentation"
            >
              Cerrar
            </div>
            <div
              className="flex flex-1 select-none items-center justify-center rounded-full py-3 text-center text-xs font-bold text-slate-900 shadow-lg"
              style={{ backgroundColor: '#FACC15' }}
              role="presentation"
            >
              Editar tarjeta
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function Studio() {
  const { t } = useAdminT();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(forgeReducer, initialState);
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [themes, setThemes] = useState<StudioThemeDoc[]>([]);
  const [packs, setPacks] = useState<StudioIconPackDoc[]>([]);
  const [skins, setSkins] = useState<StudioSkinDoc[]>([]);
  const [forgePacks, setForgePacks] = useState<ForgeIconPackOption[]>([]);
  const [forgeSkins, setForgeSkins] = useState<ForgeSkinListItem[]>([]);
  const [skinForgeSaving, setSkinForgeSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextFonts, nextThemes, nextPacks, nextSkins, nextForgePacks, nextForgeSkins] = await Promise.all([
        getStudioFonts(),
        listStudioThemes(),
        listStudioIconPacks(),
        listStudioSkins(),
        listForgeIconPacksForStudio(),
        listForgeSkinsForStudio(),
      ]);
      setFonts(nextFonts);
      setThemes(nextThemes);
      setPacks(nextPacks);
      setSkins(nextSkins);
      setForgePacks(nextForgePacks);
      setForgeSkins(nextForgeSkins);
    } catch (error) {
      console.error(error);
      setToast({ kind: 'error', message: t('admin_studio_sync_fail') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const customFont = useMemo(
    () => (state.skin.customFontId ? fonts.find((font) => font.id === state.skin.customFontId) ?? null : null),
    [fonts, state.skin.customFontId],
  );

  useGoogleFont(state.skin.googleFont, state.skin.fontSource === 'google');
  useCustomFont(customFont);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const preview = state.icons.uploadedFilePreview;
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [state.icons.uploadedFilePreview]);

  useEffect(() => {
    const preview = state.icons.referencePreview;
    if (!preview || !preview.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(preview);
  }, [state.icons.referencePreview]);

  const folderOptions = useMemo(() => {
    const set = new Set<string>(ICON_FOLDER_DEFAULTS as readonly string[]);
    for (const folder of folderDocsToNames(packs, state.icons.folder, state.icons.newFolder)) {
      if (folder) set.add(folder);
    }
    for (const forgePack of forgePacks) {
      if (forgePack.name?.trim()) set.add(forgePack.name.trim());
    }
    return Array.from(set);
  }, [packs, forgePacks, state.icons.folder, state.icons.newFolder]);

  const handleAnalyzeBrand = useCallback(async () => {
    const data = state.icons.referenceBase64.trim();
    const mime = state.icons.referenceMime.trim() || 'image/png';
    if (!data) {
      setToast({ kind: 'error', message: t('admin_studio_ref_image_required') });
      return;
    }
    dispatch({
      type: 'ICON_PATCH',
      patch: { analyzingBrand: true, analyzingMessage: t('admin_studio_analyzing_brand') },
    });
    try {
      const result = await analyzeBrandReference(data, mime);
      dispatch({
        type: 'ICON_PATCH',
        patch: {
          analyzingBrand: false,
          analyzingMessage: '',
          brandContext: result.contextDescription,
          colorPrimary: result.primaryHex,
          colorSecondary: result.secondaryHex,
          colorBackground: result.bgHex,
        },
      });
    } catch (error) {
      dispatch({ type: 'ICON_PATCH', patch: { analyzingBrand: false, analyzingMessage: '' } });
      setToast({
        kind: 'error',
        message: t('admin_studio_brand_analyze_fail'),
      });
    }
  }, [state.icons.referenceBase64, state.icons.referenceMime, t]);

  const handleGenerateIcons = useCallback(async () => {
    if (!state.icons.brandContext.trim() && !state.icons.iconItems.trim()) {
      setToast({
        kind: 'error',
        message: t('admin_studio_context_required'),
      });
      return;
    }

    dispatch({ type: 'ICON_PATCH', patch: { generating: true, generatingMessage: t('admin_studio_generating_prompts') } });
    try {
      const pack = await generateAIIconsBatch({
        context: state.icons.brandContext,
        itemsRequested: state.icons.iconItems,
        colors: {
          primaryHex: state.icons.colorPrimary,
          secondaryHex: state.icons.colorSecondary,
          bgHex: state.icons.colorBackground,
        },
        style: state.icons.style,
        shape: state.icons.shape,
        count: state.icons.count,
        onProgress: (message) => {
          dispatch({ type: 'ICON_PATCH', patch: { generatingMessage: message } });
        },
      });

      const candidates = pack.icons.map((icon, index): AiIconCandidate => ({
        id: `icon-${Date.now()}-${index}`,
        name: titleCaseFromPrompt(icon.description, `Icon ${index + 1}`),
        prompt: icon.description,
        gradient: AI_ICON_GRADIENTS[index % AI_ICON_GRADIENTS.length],
        imageUrl: icon.url,
        seed: index + 1,
      }));

      dispatch({
        type: 'SET_GENERATED_ICONS',
        candidates,
        suggestedName: pack.suggestedName,
        suggestedPriceDiamonds: pack.suggestedPriceDiamonds,
        suggestedPriceCSCoins: pack.suggestedPriceCSCoins,
      });
    } catch (error) {
      dispatch({ type: 'ICON_PATCH', patch: { generating: false, generatingMessage: '' } });
      setToast({ kind: 'error', message: t('admin_studio_icons_gen_fail') });
    }
  }, [
    state.icons.brandContext,
    state.icons.iconItems,
    state.icons.count,
    state.icons.style,
    state.icons.shape,
    state.icons.colorPrimary,
    state.icons.colorSecondary,
    state.icons.colorBackground,
    t,
  ]);

  const handleUploadIconFile = useCallback((file: File | null) => {
    if (!file) {
      dispatch({ type: 'SET_UPLOADED_ICON', file: null, preview: '' });
      return;
    }
    const preview = URL.createObjectURL(file);
    dispatch({ type: 'SET_UPLOADED_ICON', file, preview });
  }, []);

  const handlePublishIcon = useCallback(async () => {
    const ic = state.icons;
    const name = ic.name.trim();
    if (!name) {
      setToast({ kind: 'error', message: t('admin_studio_icon_name_required') });
      return;
    }

    const folder = ic.folder === NEW_FOLDER_VALUE ? ic.newFolder.trim() : ic.folder;
    if (!folder) {
      setToast({ kind: 'error', message: t('admin_studio_icon_folder_required') });
      return;
    }

    let source: { kind: 'file'; file: File } | { kind: 'url'; url: string };
    if (ic.uploadedFile) {
      source = { kind: 'file', file: ic.uploadedFile };
    } else {
      const candidate = ic.candidates.find((entry) => entry.id === ic.selectedId);
      if (!candidate?.imageUrl) {
        setToast({ kind: 'error', message: t('admin_studio_icon_select_or_upload') });
        return;
      }
      source = { kind: 'url', url: candidate.imageUrl };
    }

    dispatch({ type: 'ICON_PATCH', patch: { publishing: true } });
    try {
      await publishAdminStudioIcon({
        source,
        name,
        folder,
        priceDiamonds: Number(ic.priceDiamonds) || 0,
        priceCoins: Number(ic.priceCoins) || 0,
        style: ic.style,
        shape: ic.shape,
        createdBy: user?.uid,
        createdByEmail: user?.email,
      });
      dispatch({ type: 'ICON_PATCH', patch: { publishing: false, folder, newFolder: '' } });
      setToast({ kind: 'success', message: t('admin_studio_icon_published', { name }) });
      void refresh();
    } catch (error) {
      console.error('[Studio] publish icon', error);
      dispatch({ type: 'ICON_PATCH', patch: { publishing: false } });
      setToast({ kind: 'error', message: t('admin_studio_icon_publish_fail') });
    }
  }, [state.icons, refresh, user, t]);

  const handleGenerateSkinAi = useCallback(async () => {
    dispatch({ type: 'SKIN_PATCH', patch: { generating: true } });
    try {
      const [logic, wallpaperUrl] = await Promise.all([
        generateThemeLogic(state.skin.prompt),
        generateAIWallpaper(state.skin.prompt),
      ]);
      dispatch({ type: 'APPLY_THEME_LOGIC', logic, wallpaperUrl });
    } catch (error) {
      console.error('[Studio] generate skin AI', error);
      dispatch({ type: 'SKIN_PATCH', patch: { generating: false } });
      setToast({ kind: 'error', message: t('admin_studio_skin_forge_fail') });
    }
  }, [state.skin.prompt, t]);

  const handleAnalyzeSkinBrand = useCallback(async () => {
    const data = state.skin.skinLogoBase64.trim();
    const mime = state.skin.skinLogoMime.trim() || 'image/png';
    if (!data) {
      setToast({ kind: 'error', message: t('admin_studio_skin_logo_required') });
      return;
    }
    dispatch({
      type: 'SKIN_PATCH',
      patch: { analyzingBrand: true, analyzingMessage: t('admin_studio_skin_analyzing') },
    });
    try {
      const result = await analyzeBrandReference(data, mime);
      dispatch({
        type: 'SKIN_PATCH',
        patch: {
          analyzingBrand: false,
          analyzingMessage: '',
          prompt: state.skin.prompt.trim() ? state.skin.prompt : result.contextDescription,
          wallpaperHex: result.bgHex,
          labelsHex: result.primaryHex,
          vectorHex: result.secondaryHex,
        },
      });
    } catch (error) {
      dispatch({ type: 'SKIN_PATCH', patch: { analyzingBrand: false, analyzingMessage: '' } });
      setToast({
        kind: 'error',
        message: t('admin_studio_skin_brand_analyze_fail'),
      });
    }
  }, [state.skin.prompt, state.skin.skinLogoBase64, state.skin.skinLogoMime, t]);

  const handleForgeSkinPersist = useCallback(async () => {
    const sk = state.skin;
    if (!sk.name.trim()) {
      setToast({ kind: 'error', message: t('admin_studio_skin_name_required') });
      return;
    }
    if (!sk.wallpaperFile) {
      setToast({ kind: 'error', message: t('admin_studio_skin_wallpaper_required') });
      return;
    }
    if (!sk.selectedIconPackId) {
      setToast({ kind: 'error', message: t('admin_studio_skin_pack_required') });
      return;
    }
    setSkinForgeSaving(true);
    try {
      const [wallpaperUrl] = await uploadFilesToDigitalOceanSpaces([sk.wallpaperFile]);
      const wallpaperCss = `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.18)), url("${wallpaperUrl}") center/cover no-repeat, ${sk.wallpaperHex}`;
      await publishForgeSkinDocument({
        name: sk.name.trim(),
        wallpaperUrl,
        iconPackId: sk.selectedIconPackId,
        wallpaperHex: sk.wallpaperHex,
        labelsHex: sk.labelsHex,
        vectorHex: sk.vectorHex,
        wallpaperCss,
        priceUsd: Number(sk.priceUsd) || 0,
        priceCoins: sk.priceCoins,
        fontSource: sk.fontSource,
        googleFont: sk.googleFont,
        customFontId: sk.customFontId,
        prompt: sk.prompt,
        createdBy: user?.uid,
        createdByEmail: user?.email ?? null,
      });
      dispatch({
        type: 'SKIN_PATCH',
        patch: {
          wallpaperFile: null,
          wallpaperPreview: '',
          wallpaperCss,
        },
      });
      setToast({ kind: 'success', message: t('admin_studio_skin_saved') });
      void refresh();
    } catch (error) {
      console.error('[Studio] forge skin', error);
      setToast({
        kind: 'error',
        message: t('admin_studio_skin_save_fail'),
      });
    } finally {
      setSkinForgeSaving(false);
    }
  }, [state.skin, refresh, user, t]);

  const tabs: Array<{ id: ForgeTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'icons', label: 'Iconos AI', icon: Wand },
    { id: 'packs', label: 'Icon Packs', icon: Package },
    { id: 'skins', label: 'Skins', icon: Palette },
    { id: 'layout', label: 'Layout', icon: LayoutGrid },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-5 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4D8FFF] via-[#2F7BFF] to-[#7A4DFF] shadow-xl shadow-[#2F7BFF]/20">
              <Wand className="h-6 w-6 text-slate-950" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#4D8FFF]">Card-Social Studio</p>
              <h1 className="text-2xl font-black tracking-tight text-white">La Forja AI Visual Engine</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-slate-300">
              Fonts {fonts.length} · Themes {themes.length} · Catálogo {forgePacks.length} · Skins {forgeSkins.length}{' '}
              <span className="text-slate-500">
                · studio packs {packs.length} · studio skins {skins.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-cyan-300" />}
              Sincronizar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1720px] lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_500px]">
        <section className="border-r border-white/10 bg-[radial-gradient(circle_at_15%_0,rgba(14,165,233,.16),transparent_32%),#020617] px-4 py-6 sm:px-6 lg:min-h-[calc(100vh-89px)]">
          <div className="mb-6 grid gap-2 rounded-[1.4rem] border border-white/10 bg-slate-900/70 p-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => dispatch({ type: 'SET_TAB', tab: id })}
                className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
                  state.tab === id
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white shadow-xl shadow-cyan-500/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {state.tab === 'icons' ? (
            <AiIconPanel
              state={state}
              dispatch={dispatch}
              folderOptions={folderOptions}
              onAnalyzeBrand={handleAnalyzeBrand}
              onGenerateIcons={handleGenerateIcons}
              onUploadFile={handleUploadIconFile}
              onPublish={handlePublishIcon}
            />
          ) : null}
          {state.tab === 'packs' ? (
            <IconPacksBulkPanel
              currentUser={user ? { uid: user.uid, email: user.email } : null}
              onToast={(toastMsg) => setToast(toastMsg)}
              onSaved={() => void refresh()}
            />
          ) : null}
          {state.tab === 'skins' ? (
            <AiSkinPanel
              state={state}
              dispatch={dispatch}
              fonts={fonts}
              forgePacks={forgePacks}
              onAnalyzeSkinBrand={handleAnalyzeSkinBrand}
              onGenerateSkinAi={handleGenerateSkinAi}
              onForgeSkinPersist={handleForgeSkinPersist}
              skinForgeSaving={skinForgeSaving}
              t={t}
            />
          ) : null}
          {state.tab === 'layout' ? <LayoutPanel state={state} dispatch={dispatch} /> : null}
        </section>

        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <LivePreview state={state} fonts={fonts} activeTab={state.tab} />
        </div>
      </main>

      {toast ? (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-5 py-4 text-sm font-bold shadow-2xl ${
            toast.kind === 'success'
              ? 'border-emerald-300/30 bg-emerald-950 text-emerald-100'
              : 'border-red-400/30 bg-red-950 text-red-100'
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
