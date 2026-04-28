import { GoogleGenerativeAI } from '@google/generative-ai';

export type ThemeLayoutAlignment = 'start' | 'center' | 'end';

export type GeneratedThemeLogic = {
  name: string;
  priceUSD: number;
  priceCoins: number;
  wallpaperHex: string;
  labelHex: string;
  vectorHex: string;
  fontFamily: string;
  layoutAlignment: ThemeLayoutAlignment;
};

export type GeneratedIcon = {
  description: string;
  url: string;
};

export type IconStyleId = 'flat' | '3d' | 'neumorphism' | 'minimalist' | 'neon' | 'hand-drawn';
export type IconShapeId = 'square' | 'rounded' | 'circle' | 'transparent';

export type GenerateIconsOptions = {
  prompt: string;
  count: number;
  style: IconStyleId;
  shape: IconShapeId;
  colorPrimary: string;
  colorSecondary: string;
  colorBackground: string;
};

export type GeneratedIconBriefing = {
  descriptions: string[];
  icons: GeneratedIcon[];
  suggestedName: string;
  suggestedPriceDiamonds: number;
  suggestedPriceCSCoins: number;
};

const ICON_STYLE_DESCRIPTORS: Record<IconStyleId, string> = {
  flat: 'flat 2D vector',
  '3d': 'soft 3D rendered glossy',
  neumorphism: 'soft neumorphism',
  minimalist: 'ultra minimalist outline',
  neon: 'cyberpunk neon glow',
  'hand-drawn': 'hand-drawn organic sketch',
};

const ICON_SHAPE_DESCRIPTORS: Record<IconShapeId, string> = {
  square: 'inside a square frame with sharp corners',
  rounded: 'inside a rounded-square iOS app icon frame',
  circle: 'inside a perfect circular badge frame',
  transparent: 'on a fully transparent background with no frame',
};

const ICON_STYLE_LABELS: Record<IconStyleId, string> = {
  flat: 'Flat',
  '3d': '3D',
  neumorphism: 'Neumorfismo',
  minimalist: 'Minimalista',
  neon: 'Neon',
  'hand-drawn': 'Hand-drawn',
};

const ICON_SHAPE_LABELS: Record<IconShapeId, string> = {
  square: 'Cuadrado',
  rounded: 'Redondeado',
  circle: 'Circular',
  transparent: 'Transparente',
};

// Keep this list Flash-only: Pro aliases are not available on every free-tier
// API key/project and were causing the Studio toast to surface 404s.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;
const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai/prompt';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const ALIGNMENTS = new Set<ThemeLayoutAlignment>(['start', 'center', 'end']);
let availableGeminiModelsPromise: Promise<string[]> | null = null;

type GeminiModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

const THEME_LOGIC_SYSTEM_PROMPT = [
  'You are the AI logic engine for "La Forja", a professional mobile skin builder.',
  'Return ONLY strict JSON. No markdown. No code fences. No prose. No trailing comments.',
  'The JSON object must have exactly these keys:',
  'name, priceUSD, priceCoins, wallpaperHex, labelHex, vectorHex, fontFamily, layoutAlignment.',
  'Rules:',
  '- name: short premium marketplace skin name in Spanish or English.',
  '- priceUSD: number between 0 and 25 with at most two decimals.',
  '- priceCoins: integer between 0 and 5000.',
  '- wallpaperHex, labelHex, vectorHex: valid #RRGGBB hex colors.',
  '- fontFamily: one of Inter, Poppins, Montserrat, Space Grotesk, DM Sans, Outfit, Sora, Manrope.',
  '- layoutAlignment: one of start, center, end.',
].join('\n');

const ICON_ART_DIRECTOR_PROMPT = [
  'Eres un Director de UI/UX para una marketplace mobile premium de iconos.',
  'Tu unica salida valida es JSON estricto. Sin markdown, sin code fences, sin texto adicional.',
  'El JSON debe tener EXACTAMENTE las claves: descriptions, suggestedName, suggestedPriceDiamonds, suggestedPriceCSCoins.',
  'descriptions: array de prompts EN INGLES, uno por icono pedido, frases de 6 a 16 palabras, cada una describe UN UNICO objeto aislado.',
  'No menciones layouts, spritesheets, grids, collages ni texto en las descripciones.',
  'suggestedName: nombre comercial corto (1 a 4 palabras) en espanol o ingles.',
  'suggestedPriceDiamonds: numero entero entre 1 y 50.',
  'suggestedPriceCSCoins: numero entero entre 100 y 5000.',
].join('\n');

function getGeminiApiKey() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey?.trim()) {
    throw new Error('Falta VITE_GEMINI_API_KEY en las variables de entorno del admin.');
  }
  return apiKey.trim();
}

function getGeminiClient() {
  const apiKey = getGeminiApiKey();
  return new GoogleGenerativeAI(apiKey);
}

async function listAvailableGeminiModels(): Promise<string[]> {
  if (!availableGeminiModelsPromise) {
    availableGeminiModelsPromise = fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(getGeminiApiKey())}`,
    )
      .then(async (response) => {
        if (!response.ok) return [];
        const payload = (await response.json()) as GeminiModelsResponse;
        return (payload.models ?? [])
          .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
          .map((model) => String(model.name ?? '').replace(/^models\//, ''))
          .filter(Boolean);
      })
      .catch(() => []);
  }

  return availableGeminiModelsPromise;
}

async function getCandidateGeminiModels() {
  const available = await listAvailableGeminiModels();
  if (!available.length) return [...GEMINI_MODELS];

  const availableSet = new Set(available);
  const preferred = GEMINI_MODELS.filter((model) => availableSet.has(model));
  const flashModels = available.filter((model) => /flash/i.test(model));
  return preferred.length > 0 ? preferred : flashModels.length > 0 ? flashModels : [...GEMINI_MODELS];
}

function stripCodeFences(rawText: string) {
  return rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(rawText: string) {
  const cleaned = stripCodeFences(rawText);
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned;

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);

  throw new Error(`Gemini no devolvio un objeto JSON. Respuesta: ${rawText.trim().slice(0, 180)}`);
}

function assertString(value: unknown, field: keyof GeneratedThemeLogic) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Gemini devolvio "${field}" invalido.`);
  }
  return value.trim();
}

function assertNumber(value: unknown, field: keyof GeneratedThemeLogic) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    throw new Error(`Gemini devolvio "${field}" invalido.`);
  }
  return next;
}

function normalizeHex(value: unknown, field: keyof GeneratedThemeLogic) {
  const next = assertString(value, field);
  if (!HEX_PATTERN.test(next)) {
    throw new Error(`Gemini devolvio "${field}" con formato hex invalido: ${next}`);
  }
  return next.toUpperCase();
}

function normalizeAlignment(value: unknown) {
  const next = assertString(value, 'layoutAlignment').toLowerCase();
  if (!ALIGNMENTS.has(next as ThemeLayoutAlignment)) {
    throw new Error(`Gemini devolvio "layoutAlignment" invalido: ${next}`);
  }
  return next as ThemeLayoutAlignment;
}

function parseThemeLogic(rawText: string): GeneratedThemeLogic {
  let parsed: Record<string, unknown>;
  const jsonText = extractJsonObject(rawText);

  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Gemini devolvio JSON mal formateado: ${error instanceof Error ? error.message : 'parse error'}. Respuesta: ${rawText.slice(0, 180)}`,
    );
  }

  return {
    name: assertString(parsed.name, 'name'),
    priceUSD: Math.max(0, Math.min(25, Number(assertNumber(parsed.priceUSD, 'priceUSD').toFixed(2)))),
    priceCoins: Math.max(0, Math.min(5000, Math.round(assertNumber(parsed.priceCoins, 'priceCoins')))),
    wallpaperHex: normalizeHex(parsed.wallpaperHex, 'wallpaperHex'),
    labelHex: normalizeHex(parsed.labelHex, 'labelHex'),
    vectorHex: normalizeHex(parsed.vectorHex, 'vectorHex'),
    fontFamily: assertString(parsed.fontFamily, 'fontFamily'),
    layoutAlignment: normalizeAlignment(parsed.layoutAlignment),
  };
}

async function callGeminiJsonText(
  systemInstruction: string,
  userPrompt: string,
  temperature: number,
): Promise<string> {
  const client = getGeminiClient();
  let lastError: unknown = null;
  const attemptedModels: string[] = [];
  const candidateModels = await getCandidateGeminiModels();

  for (const modelName of candidateModels) {
    attemptedModels.push(modelName);
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(userPrompt);
      return result.response.text();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const canRetryWithFallback = /404|not found|not supported|not available|model/i.test(message);
      if (!canRetryWithFallback || modelName === candidateModels[candidateModels.length - 1]) {
        break;
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'error desconocido');
  throw new Error(
    `No se pudo generar contenido con Gemini Flash. Modelos intentados: ${attemptedModels.join(', ') || 'ninguno disponible'}. Ultimo error: ${detail}`,
  );
}

export async function generateThemeLogic(prompt: string): Promise<GeneratedThemeLogic> {
  const userPrompt = [
    `Prompt del admin: ${prompt || 'Skin premium profesional para Card-Social.'}`,
    'Devuelve solo el JSON solicitado.',
  ].join('\n');

  const rawText = await callGeminiJsonText(THEME_LOGIC_SYSTEM_PROMPT, userPrompt, 0.75);
  return parseThemeLogic(rawText);
}

function clampIconCount(count: number) {
  if (!Number.isFinite(count)) return 4;
  return Math.max(1, Math.min(10, Math.round(count)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function fallbackIconDescriptions(prompt: string, expected: number): string[] {
  const seed = (prompt || 'premium minimalist mobile app icon').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  return Array.from({ length: expected }, (_, index) => `A single minimalist icon related to ${seed} variation ${index + 1}`);
}

function fallbackSetName(prompt: string) {
  const cleaned = (prompt || 'AI Icon Set').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  if (!cleaned) return 'AI Icon Set';
  const words = cleaned.split(/\s+/).slice(0, 3);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

function parseIconBriefing(
  rawText: string,
  expected: number,
  options: GenerateIconsOptions,
): {
  descriptions: string[];
  suggestedName: string;
  suggestedPriceDiamonds: number;
  suggestedPriceCSCoins: number;
} {
  const jsonText = extractJsonObject(rawText);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Gemini devolvio JSON mal formateado: ${error instanceof Error ? error.message : 'parse error'}. Respuesta: ${rawText.slice(0, 180)}`,
    );
  }

  const rawDescriptions = parsed.descriptions;
  const descriptions: string[] = [];
  if (Array.isArray(rawDescriptions)) {
    for (const value of rawDescriptions) {
      if (typeof value === 'string' && value.trim().length > 0) {
        descriptions.push(value.trim());
      } else if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const candidate = [obj.description, obj.text, obj.name].find(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        );
        if (candidate) descriptions.push(candidate.trim());
      }
    }
  }

  if (!descriptions.length) {
    throw new Error('Gemini no devolvio descripciones validas para los iconos.');
  }

  const fallback = fallbackIconDescriptions(options.prompt, expected);
  while (descriptions.length < expected) {
    descriptions.push(fallback[descriptions.length] ?? `A single minimalist isolated icon variation ${descriptions.length + 1}`);
  }

  const suggestedName =
    typeof parsed.suggestedName === 'string' && parsed.suggestedName.trim().length > 0
      ? parsed.suggestedName.trim()
      : fallbackSetName(options.prompt);

  return {
    descriptions: descriptions.slice(0, expected),
    suggestedName,
    suggestedPriceDiamonds: clampNumber(parsed.suggestedPriceDiamonds, 1, 50, 5),
    suggestedPriceCSCoins: clampNumber(parsed.suggestedPriceCSCoins, 100, 5000, 500),
  };
}

function buildPollinationsUrl(prompt: string, width: number, height: number, seed: number) {
  const encodedPrompt = encodeURIComponent(prompt);
  return `${POLLINATIONS_BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

function buildIconImagePrompt(description: string, options: GenerateIconsOptions) {
  return [
    `${ICON_STYLE_DESCRIPTORS[options.style]} icon of ${description}`,
    ICON_SHAPE_DESCRIPTORS[options.shape],
    `primary color ${options.colorPrimary}`,
    `secondary color ${options.colorSecondary}`,
    `background color ${options.colorBackground}`,
    'centered, single isolated subject, premium quality, no text, no letters',
  ].join(', ');
}

export async function generateAIIconsBatch(options: GenerateIconsOptions): Promise<GeneratedIconBriefing> {
  const expected = clampIconCount(options.count);
  const cleanPrompt = (options.prompt || 'a generic premium mobile app theme').trim();
  const safeOptions: GenerateIconsOptions = { ...options, count: expected, prompt: cleanPrompt };

  const userPrompt = [
    `El cliente pide ${expected} iconos sobre "${cleanPrompt}".`,
    `Estilo: ${ICON_STYLE_LABELS[safeOptions.style]}.`,
    `Forma del contenedor: ${ICON_SHAPE_LABELS[safeOptions.shape]}.`,
    `Colores: principal ${safeOptions.colorPrimary}, secundario ${safeOptions.colorSecondary}, fondo ${safeOptions.colorBackground}.`,
    'Devuelve SOLO un JSON con este formato exacto:',
    '{ "descriptions": ["prompt exacto en ingles para motor de imagenes 1", "..."], "suggestedName": "Nombre Comercial del Set", "suggestedPriceDiamonds": 5, "suggestedPriceCSCoins": 500 }',
  ].join('\n');

  let briefing: {
    descriptions: string[];
    suggestedName: string;
    suggestedPriceDiamonds: number;
    suggestedPriceCSCoins: number;
  };

  try {
    const rawText = await callGeminiJsonText(ICON_ART_DIRECTOR_PROMPT, userPrompt, 0.85);
    briefing = parseIconBriefing(rawText, expected, safeOptions);
  } catch (error) {
    console.warn('[aiStudioService] Gemini brief fallo, usando fallback local:', error);
    briefing = {
      descriptions: fallbackIconDescriptions(cleanPrompt, expected),
      suggestedName: fallbackSetName(cleanPrompt),
      suggestedPriceDiamonds: 5,
      suggestedPriceCSCoins: 500,
    };
  }

  const seedBase = Math.floor(Date.now() / 1000);
  const icons: GeneratedIcon[] = briefing.descriptions.map((description, index) => ({
    description,
    url: buildPollinationsUrl(buildIconImagePrompt(description, safeOptions), 256, 256, seedBase + index + 1),
  }));

  return {
    descriptions: briefing.descriptions,
    icons,
    suggestedName: briefing.suggestedName,
    suggestedPriceDiamonds: briefing.suggestedPriceDiamonds,
    suggestedPriceCSCoins: briefing.suggestedPriceCSCoins,
  };
}

export async function generateAIWallpaper(prompt: string): Promise<string> {
  const wallpaperPrompt = `${prompt || 'premium mobile wallpaper'} vertical mobile wallpaper, clean gradients, professional visual identity, no text`;
  const seed = Math.floor(Date.now() / 1000) + 77;
  return buildPollinationsUrl(wallpaperPrompt, 1024, 1792, seed);
}
