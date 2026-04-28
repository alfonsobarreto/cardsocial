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

const GEMINI_MODELS = ['gemini-1.5-pro', 'gemini-pro'] as const;
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

function getGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey?.trim()) {
    throw new Error('Falta VITE_GEMINI_API_KEY en las variables de entorno del admin.');
  }
  return new GoogleGenerativeAI(apiKey);
}

function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (withoutFence.startsWith('{') && withoutFence.endsWith('}')) {
    return withoutFence;
  }

  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return withoutFence.slice(start, end + 1);
  }

  throw new Error(`Gemini no devolvio un objeto JSON. Respuesta: ${trimmed.slice(0, 180)}`);
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

export async function generateThemeLogic(prompt: string): Promise<GeneratedThemeLogic> {
  const client = getGeminiClient();
  let lastError: unknown = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: THEME_LOGIC_SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.75,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent([
        `Prompt del admin: ${prompt || 'Skin premium profesional para Card-Social.'}`,
        'Devuelve solo el JSON solicitado.',
      ]);

      return parseThemeLogic(result.response.text());
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const canRetryWithFallback = /404|not found|not supported|not available|model/i.test(message);
      if (!canRetryWithFallback || modelName === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo generar logica con Gemini.');
}

function buildPollinationsUrl(prompt: string, width: number, height: number, seed: number) {
  const encodedPrompt = encodeURIComponent(prompt);
  return `${POLLINATIONS_BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

export async function generateAIIconsBatch(prompt: string): Promise<string[]> {
  const basePrompt = `${prompt || 'premium social media icons'} 3d icon minimalist app icon, isolated object, high contrast, studio lighting`;
  const seedBase = Math.floor(Date.now() / 1000);

  return Array.from({ length: 10 }, (_, index) =>
    buildPollinationsUrl(`${basePrompt}, variation ${index + 1}`, 256, 256, seedBase + index + 1),
  );
}

export async function generateAIWallpaper(prompt: string): Promise<string> {
  const wallpaperPrompt = `${prompt || 'premium mobile wallpaper'} vertical mobile wallpaper, clean gradients, professional visual identity, no text`;
  const seed = Math.floor(Date.now() / 1000) + 77;
  return buildPollinationsUrl(wallpaperPrompt, 1024, 1792, seed);
}
