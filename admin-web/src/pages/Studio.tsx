/**
 * LA FORJA — AI Visual Engine (admin)
 * Mock AI actions with centralized reducer state and a live iPhone layout preview.
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
  ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  MonitorSmartphone,
  Palette,
  Sparkles,
  Type,
  Wand,
} from 'lucide-react';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  getStudioFonts,
  listStudioIconPacks,
  listStudioSkins,
  listStudioThemes,
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

const ICON_GROUPS = ['2D', '3D', 'Neon', 'Glass', 'Metal', 'Mascots'] as const;

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
  seed: number;
};

type AiIconState = {
  prompt: string;
  generating: boolean;
  candidates: AiIconCandidate[];
  selectedId: string;
  group: (typeof ICON_GROUPS)[number];
  priceUsd: string;
  name: string;
};

type AiSkinState = {
  prompt: string;
  generating: boolean;
  name: string;
  priceUsd: string;
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
  | { type: 'GENERATE_ICONS' }
  | { type: 'FORGE_SKIN'; fontId?: string };

const initialState: ForgeState = {
  tab: 'icons',
  icons: {
    prompt: '',
    generating: false,
    candidates: [],
    selectedId: '',
    group: '3D',
    priceUsd: '4.99',
    name: '',
  },
  skin: {
    prompt: '',
    generating: false,
    name: 'Lone Star Voltage',
    priceUsd: '9.99',
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
    case 'GENERATE_ICONS': {
      const candidates = createIconCandidates(state.icons.prompt);
      return {
        ...state,
        icons: {
          ...state.icons,
          generating: false,
          candidates,
          selectedId: candidates[0]?.id ?? '',
          name: candidates[0]?.name ?? '',
          priceUsd: '4.99',
        },
      };
    }
    case 'FORGE_SKIN': {
      const name = titleCaseFromPrompt(state.skin.prompt, 'Lone Star Voltage');
      return {
        ...state,
        skin: {
          ...state.skin,
          generating: false,
          name,
          priceUsd: '12.99',
          wallpaperHex: '#bf5700',
          labelsHex: '#fff7ed',
          vectorHex: '#1f2937',
          wallpaperCss:
            'radial-gradient(circle at 25% 18%, rgba(255,247,237,.95) 0 8%, transparent 29%), radial-gradient(circle at 78% 14%, rgba(249,115,22,.7) 0 13%, transparent 34%), linear-gradient(145deg, #bf5700 0%, #5f1d05 46%, #111827 100%)',
          fontSource: action.fontId ? 'custom' : 'google',
          customFontId: action.fontId ?? state.skin.customFontId,
          googleFont: action.fontId ? state.skin.googleFont : 'Sora',
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,.7),transparent_22%),radial-gradient(circle_at_78%_82%,rgba(0,0,0,.35),transparent_34%)]" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/35 bg-white/20 shadow-2xl backdrop-blur-md">
        <Sparkles className="h-7 w-7 text-white drop-shadow" />
      </div>
      <span className="absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-black text-white/90">
        {candidate.seed}
      </span>
    </div>
  );
}

function AiIconPanel({
  state,
  dispatch,
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
}) {
  const selected = state.icons.candidates.find((candidate) => candidate.id === state.icons.selectedId);

  return (
    <div className="space-y-5">
      <PanelCard title="Generador por Lotes" eyebrow="AI Icon Lab" icon={BrainCircuit}>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
          <TextInput
            value={state.icons.prompt}
            onChange={(prompt) => dispatch({ type: 'ICON_PATCH', patch: { prompt } })}
            placeholder="Describe los iconos (ej. Iconos 3D de email)"
          />
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'ICON_PATCH', patch: { generating: true } });
              window.setTimeout(() => dispatch({ type: 'GENERATE_ICONS' }), 450);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5"
          >
            {state.icons.generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand className="h-4 w-4" />}
            Generar 10 Opciones
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(state.icons.candidates.length ? state.icons.candidates : createIconCandidates('')).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() =>
                dispatch({
                  type: 'ICON_PATCH',
                  patch: { selectedId: candidate.id, name: candidate.name },
                })
              }
              className="group rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-2 text-left transition hover:-translate-y-1 hover:border-cyan-300/40"
            >
              <IconArtwork candidate={candidate} selected={state.icons.selectedId === candidate.id} />
              <p className="mt-2 truncate px-1 text-xs font-bold text-slate-300">{candidate.name}</p>
            </button>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="Configuracion del Icono Seleccionado" eyebrow={selected ? selected.name : 'Select one'} icon={Layers}>
        <div className="grid gap-4 xl:grid-cols-[180px_1fr]">
          <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/60 p-3">
            <IconArtwork candidate={selected ?? createIconCandidates('')[0]} selected />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Asignar a Grupo/Carpeta</FieldLabel>
              <select
                value={state.icons.group}
                onChange={(event) =>
                  dispatch({
                    type: 'ICON_PATCH',
                    patch: { group: event.target.value as AiIconState['group'] },
                  })
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-slate-100 outline-none focus:ring-4 focus:ring-cyan-500/10"
              >
                {ICON_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel>Precio (USD)</FieldLabel>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  value={state.icons.priceUsd}
                  onChange={(priceUsd) => dispatch({ type: 'ICON_PATCH', patch: { priceUsd } })}
                />
                <MagicButton
                  label="Sugerir precio"
                  onClick={() => dispatch({ type: 'ICON_PATCH', patch: { priceUsd: state.icons.group === '3D' ? '5.99' : '3.99' } })}
                />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FieldLabel>Nombre</FieldLabel>
              <div className="flex gap-2">
                <TextInput
                  value={state.icons.name}
                  onChange={(name) => dispatch({ type: 'ICON_PATCH', patch: { name } })}
                  placeholder="Nombre del icono"
                />
                <MagicButton
                  label="Sugerir nombre"
                  onClick={() =>
                    dispatch({
                      type: 'ICON_PATCH',
                      patch: { name: `${titleCaseFromPrompt(state.icons.prompt, 'Prisma Icon')} ${state.icons.group}` },
                    })
                  }
                />
              </div>
            </div>
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
}: {
  state: ForgeState;
  dispatch: React.Dispatch<ForgeAction>;
  fonts: StudioFont[];
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
            onClick={() => {
              dispatch({ type: 'SKIN_PATCH', patch: { generating: true } });
              window.setTimeout(() => dispatch({ type: 'FORGE_SKIN', fontId: fonts[0]?.id }), 500);
            }}
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
  const selectedIcon = state.icons.candidates.find((candidate) => candidate.id === state.icons.selectedId) ?? createIconCandidates('')[0];
  const customFont = state.skin.customFontId ? fonts.find((font) => font.id === state.skin.customFontId) ?? null : null;
  const fontFamily =
    state.skin.fontSource === 'custom' && customFont
      ? `'${customFont.family}', system-ui, sans-serif`
      : `'${state.skin.googleFont.replace(/\+/g, ' ')}', system-ui, sans-serif`;

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
                        ${state.skin.priceUsd} · {state.icons.group}
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
                  {Array.from({ length: 12 }, (_, index) => (
                    <div
                      key={index}
                      className="min-w-4 overflow-hidden rounded-2xl"
                      style={{
                        flex: `0 0 ${iconBasis}`,
                        maxWidth: iconBasis,
                      }}
                    >
                      <IconArtwork candidate={selectedIcon} />
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

export default function Studio() {
  const [state, dispatch] = useReducer(forgeReducer, initialState);
  const [fonts, setFonts] = useState<StudioFont[]>([]);
  const [themes, setThemes] = useState<StudioThemeDoc[]>([]);
  const [packs, setPacks] = useState<StudioIconPackDoc[]>([]);
  const [skins, setSkins] = useState<StudioSkinDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

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
      setToast('No se pudieron sincronizar los assets de La Forja.');
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

          {state.tab === 'icons' ? <AiIconPanel state={state} dispatch={dispatch} /> : null}
          {state.tab === 'skins' ? <AiSkinPanel state={state} dispatch={dispatch} fonts={fonts} /> : null}
          {state.tab === 'layout' ? <LayoutPanel state={state} dispatch={dispatch} /> : null}
        </section>

        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <LivePreview state={state} fonts={fonts} />
        </div>
      </main>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-red-400/30 bg-red-950 px-5 py-4 text-sm font-bold text-red-100 shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
