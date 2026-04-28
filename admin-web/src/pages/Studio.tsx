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
  Diamond,
  Folder,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  MonitorSmartphone,
  Palette,
  Rocket,
  Sparkles,
  Type,
  Upload,
  Wand,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ComponentType,
  type CSSProperties,
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
import {
  generateAIIconsBatch,
  generateAIWallpaper,
  generateThemeLogic,
  type ExtractedBrandColors,
  type GeneratedThemeLogic,
  type IconShapeId,
  type IconStyleId,
} from '../services/aiStudioService';
import {
  getStudioFonts,
  listStudioIconPacks,
  listStudioSkins,
  listStudioThemes,
  publishAdminStudioIcon,
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

type ForgeTab = 'icons' | 'skins' | 'layout';
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
  // Zone A — generator parameters
  prompt: string;
  count: number;
  style: IconStyleId;
  shape: IconShapeId;
  colorPrimary: string;
  colorSecondary: string;
  colorBackground: string;

  // Phase 2 — reference logo for Gemini Vision
  referencePreview: string;
  referenceBase64: string;
  referenceMime: string;

  // Generation lifecycle
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
  name: string;
  priceUsd: string;
  priceCoins: number;
  wallpaperHex: string;
  labelsHex: string;
  vectorHex: string;
  wallpaperCss: string;
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
    prompt: '',
    count: 4,
    style: '3d',
    shape: 'rounded',
    colorPrimary: '#6366F1',
    colorSecondary: '#22D3EE',
    colorBackground: '#0B1220',
    referencePreview: '',
    referenceBase64: '',
    referenceMime: 'image/png',
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
    name: 'Lone Star Voltage',
    priceUsd: '9.99',
    priceCoins: 1200,
    wallpaperHex: '#1a1a1a',
    labelsHex: '#f97316',
    vectorHex: '#ffffff',
    wallpaperCss: 'radial-gradient(circle at 20% 20%, #f97316 0 8%, transparent 32%), linear-gradient(145deg, #1a1a1a, #050505)',
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

function createIconCandidates(prompt: string): AiIconCandidate[] {
  const base = titleCaseFromPrompt(prompt, 'AI Icon');
  return AI_ICON_GRADIENTS.map((gradient, index) => ({
    id: `ai-icon-${index + 1}`,
    name: `${base} ${String(index + 1).padStart(2, '0')}`,
    prompt: prompt || 'Iconos premium generados por IA',
    gradient,
    seed: index + 11,
  }));
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
}: {
  title: string;
  eyebrow: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/20 backdrop-blur">
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
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10 text-amber-200 shadow-lg shadow-amber-500/10 transition hover:-translate-y-0.5 hover:bg-amber-400/20"
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

function IconArtwork({ candidate, selected }: { candidate: AiIconCandidate; selected?: boolean }) {
  return (
    <div
      className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-[1.35rem] bg-gradient-to-br ${candidate.gradient} ${
        selected ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      {candidate.imageUrl ? (
        <img src={candidate.imageUrl} alt={candidate.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,.7),transparent_22%),radial-gradient(circle_at_78%_82%,rgba(0,0,0,.35),transparent_34%)]" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/35 bg-white/20 shadow-2xl backdrop-blur-md">
            <Sparkles className="h-7 w-7 text-white drop-shadow" />
          </div>
        </>
      )}
      <span className="absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-black text-white/90">
        {candidate.seed}
      </span>
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
  onGenerateIcons,
  onUploadFile,
  onPublish,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
  folderOptions: string[];
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
  const previewSource = ic.uploadedFile ? 'Manual' : selectedCandidate ? 'IA Gemini Pro' : null;

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
    if (!file.type.startsWith('image/')) {
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
      <PanelCard title="Parametros del Generador" eyebrow="Zone A · Inputs" icon={BrainCircuit}>
        <div className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <FieldLabel>Concepto</FieldLabel>
              <TextInput
                value={ic.prompt}
                onChange={(prompt) => dispatch({ type: 'ICON_PATCH', patch: { prompt } })}
                placeholder='Ej. "Iconos para una app de fitness boutique"'
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
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">/10</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Estilo"
              value={ic.style}
              onChange={(value) => dispatch({ type: 'ICON_PATCH', patch: { style: value as IconStyleId } })}
              options={ICON_STYLE_OPTIONS}
            />
            <SelectField
              label="Forma del Contenedor"
              value={ic.shape}
              onChange={(value) => dispatch({ type: 'ICON_PATCH', patch: { shape: value as IconShapeId } })}
              options={ICON_SHAPE_OPTIONS}
            />
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

          <div className="space-y-2">
            <FieldLabel>Referencia de marca (opcional)</FieldLabel>
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
                    : 'border-white/15 bg-white/[0.02] hover:border-white/25'
                }`}
                onClick={() => referenceInputRef.current?.click()}
              >
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-200">
                  <ImageIcon className="h-4 w-4 shrink-0 text-fuchsia-300" />
                  Subir imagen de referencia para IA
                </div>
                <p className="text-[11px] font-semibold leading-snug text-slate-500">
                  Logo o escudo: Gemini extrae HEX y la cuadricula adopta la paleta al generar.
                </p>
              </div>
              {ic.referencePreview ? (
                <div className="relative shrink-0">
                  <img
                    src={ic.referencePreview}
                    alt="Referencia de marca"
                    className="h-14 w-14 rounded-xl border border-white/15 object-cover"
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
          </div>

          <button
            type="button"
            onClick={onGenerateIcons}
            disabled={ic.generating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-fuchsia-500/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ic.generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand className="h-5 w-5" />}
            Generar con Gemini Pro
          </button>
          {ic.generating && ic.generatingMessage ? (
            <p className="text-center text-xs font-semibold text-fuchsia-200/90">{ic.generatingMessage}</p>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard title="Cuadricula de Resultados" eyebrow="Zone C · Gallery" icon={LayoutGrid}>
        {ic.candidates.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-950/60 px-4 py-8 text-center text-xs font-bold text-slate-500">
            Genera con Gemini Pro para ver tus iconos aqui.
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

      <PanelCard title="Inspector & Uploader Manual" eyebrow="Zone D · Publish" icon={Layers}>
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

function AiSkinPanel({
  state,
  dispatch,
  fonts,
  onForgeSkin,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
  fonts: StudioFont[];
  onForgeSkin: () => void;
}) {
  return (
    <div className="space-y-5">
      <PanelCard title="El Master Builder" eyebrow="AI Skin Forge" icon={Diamond}>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
          <TextInput
            value={state.skin.prompt}
            onChange={(prompt) => dispatch({ type: 'SKIN_PATCH', patch: { prompt } })}
            placeholder="Describe el Skin (ej. Colores Texas Longhorns, sans-serif)"
          />
          <button
            type="button"
            onClick={onForgeSkin}
            disabled={state.skin.generating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 via-orange-500 to-rose-600 px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-orange-500/25 transition hover:-translate-y-0.5"
          >
            {state.skin.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand className="h-4 w-4" />}
            Forjar Skin con IA
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <ColorPill
            label="Wallpaper Hex"
            value={state.skin.wallpaperHex}
            onChange={(wallpaperHex) => dispatch({ type: 'SKIN_PATCH', patch: { wallpaperHex } })}
          />
          <ColorPill
            label="Labels Hex"
            value={state.skin.labelsHex}
            onChange={(labelsHex) => dispatch({ type: 'SKIN_PATCH', patch: { labelsHex } })}
          />
          <ColorPill
            label="Vector Hex"
            value={state.skin.vectorHex}
            onChange={(vectorHex) => dispatch({ type: 'SKIN_PATCH', patch: { vectorHex } })}
          />
        </div>
      </PanelCard>

      <PanelCard title="Naming, Precio y Tipografia" eyebrow="Commercial AI" icon={Type}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel>Nombre</FieldLabel>
            <div className="flex gap-2">
              <TextInput value={state.skin.name} onChange={(name) => dispatch({ type: 'SKIN_PATCH', patch: { name } })} />
              <MagicButton
                label="Sugerir nombre"
                onClick={() =>
                  dispatch({
                    type: 'SKIN_PATCH',
                    patch: { name: `${titleCaseFromPrompt(state.skin.prompt, 'Forge Skin')} Pro` },
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
                value={state.skin.priceUsd}
                onChange={(priceUsd) => dispatch({ type: 'SKIN_PATCH', patch: { priceUsd } })}
              />
              <MagicButton
                label="Sugerir precio"
                onClick={() => dispatch({ type: 'SKIN_PATCH', patch: { priceUsd: '14.99' } })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel>Precio (Coins)</FieldLabel>
            <TextInput
              type="number"
              value={String(state.skin.priceCoins)}
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
              value={state.skin.fontSource}
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
            <FieldLabel>{state.skin.fontSource === 'custom' ? 'Font Uploader' : 'Google Font'}</FieldLabel>
            {state.skin.fontSource === 'custom' ? (
              <select
                value={state.skin.customFontId}
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
                value={state.skin.googleFont}
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

      <PanelCard title="Wallpaper Generado" eyebrow="Mock Render" icon={ImageIcon}>
        <div
          className="min-h-[180px] rounded-[2rem] border border-white/10 shadow-2xl shadow-black/30"
          style={{ background: state.skin.wallpaperCss || state.skin.wallpaperHex }}
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
}: {
  state: ForgeState;
  fonts: StudioFont[];
}) {
  const customFont = state.skin.customFontId ? fonts.find((font) => font.id === state.skin.customFontId) ?? null : null;
  const fontFamily =
    state.skin.fontSource === 'custom' && customFont
      ? `'${customFont.family}', system-ui, sans-serif`
      : `'${state.skin.googleFont.replace(/\+/g, ' ')}', system-ui, sans-serif`;

  const previewIconSet =
    state.icons.candidates.length > 0
      ? state.icons.candidates
      : createIconCandidates('').slice(0, Math.max(state.icons.count, 6));

  const iconBasis = `calc((100% - ${Math.max(0, state.layout.columns - 1) * state.layout.gap}px) / ${state.layout.columns})`;
  const cssVars = {
    '--preview-text': state.skin.labelsHex,
    '--preview-vector': state.skin.vectorHex,
    '--preview-font': fontFamily,
  } as CSSProperties;

  return (
    <aside className="relative flex min-h-[760px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#1e293b_0,#020617_58%)] px-5 py-10">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
      <div className="relative w-full max-w-[380px]">
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-slate-400">
            <MonitorSmartphone className="h-4 w-4 text-cyan-300" />
            iPhone 15 Pro
          </span>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-black text-emerald-200">Live CSS</span>
        </div>

        <div className="rounded-[3rem] bg-gradient-to-br from-zinc-500 via-zinc-950 to-zinc-700 p-[3px] shadow-2xl shadow-cyan-950/50">
          <div className="relative overflow-hidden rounded-[2.82rem] bg-black p-2 ring-1 ring-white/10">
            <div className="absolute left-1/2 top-4 z-30 h-8 w-32 -translate-x-1/2 rounded-full bg-black shadow-lg ring-1 ring-white/10" />
            <div
              className="relative aspect-[9/19.5] overflow-hidden rounded-[2.35rem]"
              style={{
                ...cssVars,
                background: state.skin.wallpaperCss || state.skin.wallpaperHex,
                fontFamily: 'var(--preview-font)',
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0,rgba(255,255,255,.22),transparent_30%)]" />
              <div className="relative z-10 flex h-full flex-col px-4 pb-6 pt-14">
                <div className="rounded-[1.5rem] border border-white/20 bg-black/20 p-3 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 text-lg font-black shadow-lg"
                      style={{ backgroundColor: state.skin.vectorHex, color: state.skin.wallpaperHex }}
                    >
                      CS
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-black" style={{ color: 'var(--preview-text)' }}>
                        {state.skin.name || 'AI Visual Skin'}
                      </p>
                      <p className="truncate text-xs font-bold opacity-80" style={{ color: 'var(--preview-text)' }}>
                        ${state.skin.priceUsd} · {ICON_STYLE_OPTIONS.find((option) => option.id === state.icons.style)?.label ?? '3D'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {['Website', 'Book Now', 'Portfolio'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="rounded-2xl border border-white/20 bg-white/15 py-3 text-sm font-black shadow-lg backdrop-blur"
                      style={{ color: 'var(--preview-text)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--preview-text)' }}>
                  Icon Layout
                </p>
                <div
                  className="mt-2 flex flex-wrap rounded-[1.4rem] border border-white/15 bg-black/20 backdrop-blur-md"
                  style={{
                    justifyContent: state.layout.justify,
                    gap: state.layout.gap,
                    padding: state.layout.padding,
                  }}
                >
                  {previewIconSet.map((candidate) => (
                    <div
                      key={candidate.id}
                      className={`min-w-4 overflow-hidden rounded-2xl transition ${
                        state.icons.selectedId === candidate.id ? 'ring-2 ring-white/70' : ''
                      }`}
                      style={{
                        flex: `0 0 ${iconBasis}`,
                        maxWidth: iconBasis,
                      }}
                    >
                      <IconArtwork candidate={candidate} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

type ToastState = { kind: 'success' | 'error'; message: string };

export default function Studio() {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(forgeReducer, initialState);
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [themes, setThemes] = useState<StudioThemeDoc[]>([]);
  const [packs, setPacks] = useState<StudioIconPackDoc[]>([]);
  const [skins, setSkins] = useState<StudioSkinDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextFonts, nextThemes, nextPacks, nextSkins] = await Promise.all([
        getStudioFonts(),
        listStudioThemes(),
        listStudioIconPacks(),
        listStudioSkins(),
      ]);
      setFonts(nextFonts);
      setThemes(nextThemes);
      setPacks(nextPacks);
      setSkins(nextSkins);
    } catch (error) {
      console.error(error);
      setToast({ kind: 'error', message: 'No se pudieron sincronizar los assets de La Forja.' });
    } finally {
      setLoading(false);
    }
  }, []);

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
    return Array.from(set);
  }, [packs, state.icons.folder, state.icons.newFolder]);

  const handleGenerateIcons = useCallback(async () => {
    dispatch({ type: 'ICON_PATCH', patch: { generating: true, generatingMessage: '' } });
    try {
      const refB64 = state.icons.referenceBase64.trim();
      const refMime = state.icons.referenceMime.trim();
      const briefing = await generateAIIconsBatch({
        prompt: state.icons.prompt,
        count: state.icons.count,
        style: state.icons.style,
        shape: state.icons.shape,
        colorPrimary: state.icons.colorPrimary,
        colorSecondary: state.icons.colorSecondary,
        colorBackground: state.icons.colorBackground,
        ...(refB64 && refMime
          ? { referenceImageBase64: refB64, referenceMimeType: refMime }
          : {}),
        onProgress: (message) => {
          dispatch({ type: 'ICON_PATCH', patch: { generatingMessage: message } });
        },
      });
      const candidates = briefing.icons.map((icon, index): AiIconCandidate => ({
        id: `gemini-pro-${Date.now()}-${index}`,
        name: titleCaseFromPrompt(icon.description, `AI Icon ${index + 1}`),
        prompt: icon.description,
        gradient: AI_ICON_GRADIENTS[index % AI_ICON_GRADIENTS.length],
        imageUrl: icon.url,
        seed: index + 1,
      }));
      dispatch({
        type: 'SET_GENERATED_ICONS',
        candidates,
        suggestedName: briefing.suggestedName,
        suggestedPriceDiamonds: briefing.suggestedPriceDiamonds,
        suggestedPriceCSCoins: briefing.suggestedPriceCSCoins,
        ...(briefing.extractedColors ? { extractedColors: briefing.extractedColors } : {}),
      });
    } catch (error) {
      dispatch({ type: 'ICON_PATCH', patch: { generating: false, generatingMessage: '' } });
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Error generando iconos con la AI.' });
    }
  }, [
    state.icons.prompt,
    state.icons.count,
    state.icons.style,
    state.icons.shape,
    state.icons.colorPrimary,
    state.icons.colorSecondary,
    state.icons.colorBackground,
    state.icons.referenceBase64,
    state.icons.referenceMime,
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
      setToast({ kind: 'error', message: 'Falta el nombre del icono.' });
      return;
    }

    const folder = ic.folder === NEW_FOLDER_VALUE ? ic.newFolder.trim() : ic.folder;
    if (!folder) {
      setToast({ kind: 'error', message: 'Especifica una carpeta para el icono.' });
      return;
    }

    let source: { kind: 'file'; file: File } | { kind: 'url'; url: string };
    if (ic.uploadedFile) {
      source = { kind: 'file', file: ic.uploadedFile };
    } else {
      const candidate = ic.candidates.find((entry) => entry.id === ic.selectedId);
      if (!candidate?.imageUrl) {
        setToast({ kind: 'error', message: 'Selecciona un icono o sube uno propio antes de publicar.' });
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
      setToast({ kind: 'success', message: `Icono "${name}" publicado en la tienda.` });
      void refresh();
    } catch (error) {
      dispatch({ type: 'ICON_PATCH', patch: { publishing: false } });
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Error al publicar el icono.' });
    }
  }, [state.icons, refresh, user]);

  const handleForgeSkin = useCallback(async () => {
    dispatch({ type: 'SKIN_PATCH', patch: { generating: true } });
    try {
      const [logic, wallpaperUrl] = await Promise.all([
        generateThemeLogic(state.skin.prompt),
        generateAIWallpaper(state.skin.prompt),
      ]);
      dispatch({ type: 'APPLY_THEME_LOGIC', logic, wallpaperUrl });
    } catch (error) {
      dispatch({ type: 'SKIN_PATCH', patch: { generating: false } });
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'Error forjando el skin con Gemini.' });
    }
  }, [state.skin.prompt]);

  const tabs: Array<{ id: ForgeTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'icons', label: 'Iconos AI', icon: Wand },
    { id: 'skins', label: 'Skins AI', icon: Palette },
    { id: 'layout', label: 'Layout Controls', icon: LayoutGrid },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-5 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 shadow-xl shadow-orange-500/20">
              <Wand className="h-6 w-6 text-slate-950" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300">Card-Social Studio</p>
              <h1 className="text-2xl font-black tracking-tight text-white">La Forja AI Visual Engine</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-slate-300">
              Fonts {fonts.length} · Themes {themes.length} · Packs {packs.length} · Skins {skins.length}
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
          <div className="mb-6 grid gap-2 rounded-[1.4rem] border border-white/10 bg-slate-900/70 p-1.5 sm:grid-cols-3">
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
              onGenerateIcons={handleGenerateIcons}
              onUploadFile={handleUploadIconFile}
              onPublish={handlePublishIcon}
            />
          ) : null}
          {state.tab === 'skins' ? <AiSkinPanel state={state} dispatch={dispatch} fonts={fonts} onForgeSkin={handleForgeSkin} /> : null}
          {state.tab === 'layout' ? <LayoutPanel state={state} dispatch={dispatch} /> : null}
        </section>

        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <LivePreview state={state} fonts={fonts} />
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
