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

const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro'] as const;
const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai/prompt';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;
const ALIGNMENTS = new Set<ThemeLayoutAlignment>(['start', 'center', 'end']);

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

const ICON_DESCRIPTIONS_SYSTEM_PROMPT = [
  'You design icon sets for premium mobile apps.',
  'Always reply with strict JSON. No markdown, no code fences, no prose.',
  'Return ONLY a JSON array of short concrete English descriptions of single, isolated objects.',
  'Each item must describe ONE element only. Never list multiple objects in the same item.',
  'Forbidden: spritesheets, collages, grids, layouts, backgrounds, words, letters, text, UI mockups.',
  'Each item must be 4 to 14 words and start with "A" or "An".',
].join('\n');

function getGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey?.trim()) {
    throw new Error('Falta VITE_GEMINI_API_KEY en las variables de entorno del admin.');
  }
  return new GoogleGenerativeAI(apiKey);
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

function extractJsonArray(rawText: string) {
  const cleaned = stripCodeFences(rawText);
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) return cleaned;

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);

  throw new Error(`Gemini no devolvio un array JSON. Respuesta: ${rawText.trim().slice(0, 180)}`);
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

  for (const modelName of GEMINI_MODELS) {
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
      if (!canRetryWithFallback || modelName === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo generar contenido con Gemini.');
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
  return Math.max(1, Math.min(12, Math.round(count)));
}

function fallbackIconDescriptions(prompt: string, expected: number): string[] {
  const seed = (prompt || 'premium minimalist mobile app icon').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  return Array.from({ length: expected }, (_, index) => `A single minimalist icon related to ${seed} variation ${index + 1}`);
}

function parseIconDescriptions(rawText: string, expected: number, prompt: string): string[] {
  const jsonText = extractJsonArray(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `Gemini devolvio JSON mal formateado: ${error instanceof Error ? error.message : 'parse error'}. Respuesta: ${rawText.slice(0, 180)}`,
    );
  }

  let array: unknown[] = [];
  if (Array.isArray(parsed)) {
    array = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const found = Object.values(obj).find((value) => Array.isArray(value));
    if (Array.isArray(found)) array = found;
  }

  const descriptions: string[] = [];
  for (const value of array) {
    if (typeof value === 'string' && value.trim().length > 0) {
      descriptions.push(value.trim());
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const candidate = [obj.description, obj.text, obj.name, obj.icon].find(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      );
      if (candidate) descriptions.push(candidate.trim());
    }
  }

  if (!descriptions.length) {
    throw new Error('Gemini no devolvio descripciones validas para los iconos.');
  }

  const fallback = fallbackIconDescriptions(prompt, expected);
  while (descriptions.length < expected) {
    descriptions.push(fallback[descriptions.length] ?? `A single minimalist isolated icon variation ${descriptions.length + 1}`);
  }
  return descriptions.slice(0, expected);
}

function buildPollinationsUrl(prompt: string, width: number, height: number, seed: number) {
  const encodedPrompt = encodeURIComponent(prompt);
  return `${POLLINATIONS_BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

function buildIconImagePrompt(description: string) {
  return `A single, isolated, centered, minimalist iOS app icon of ${description}, solid background, vector style`;
}

export async function generateAIIconsBatch(prompt: string, count = 4): Promise<GeneratedIcon[]> {
  const expected = clampIconCount(count);
  const cleanPrompt = (prompt || 'a generic premium mobile app theme').trim();

  const userPrompt = [
    `The user wants a set of icons for a mobile app about this topic: "${cleanPrompt}".`,
    `Return a JSON array with EXACTLY ${expected} concise English descriptions of individual elements.`,
    'Each entry must describe a SINGLE isolated object, never a layout or a group.',
    'Example for "Texas Longhorns": ["A single orange longhorn silhouette", "A lone star logo", "An american football"].',
  ].join('\n');

  let descriptions: string[];
  try {
    const rawText = await callGeminiJsonText(ICON_DESCRIPTIONS_SYSTEM_PROMPT, userPrompt, 0.9);
    descriptions = parseIconDescriptions(rawText, expected, cleanPrompt);
  } catch (error) {
    console.warn('[aiStudioService] Gemini descripciones fallaron, usando fallback local:', error);
    descriptions = fallbackIconDescriptions(cleanPrompt, expected);
  }

  const seedBase = Math.floor(Date.now() / 1000);
  return descriptions.map((description, index) => ({
    description,
    url: buildPollinationsUrl(buildIconImagePrompt(description), 256, 256, seedBase + index + 1),
  }));
}

export async function generateAIWallpaper(prompt: string): Promise<string> {
  const wallpaperPrompt = `${prompt || 'premium mobile wallpaper'} vertical mobile wallpaper, clean gradients, professional visual identity, no text`;
  const seed = Math.floor(Date.now() / 1000) + 77;
  return buildPollinationsUrl(wallpaperPrompt, 1024, 1792, seed);
}
