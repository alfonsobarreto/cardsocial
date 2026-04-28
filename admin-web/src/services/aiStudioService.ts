import { GoogleGenerativeAI, type Part } from '@google/generative-ai';

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

export type ExtractedBrandColors = {
  primaryHex: string;
  secondaryHex: string;
  bgHex: string;
};

export type BrandAnalysisResult = ExtractedBrandColors & {
  contextDescription: string;
};

export type IconPromptBriefing = {
  descriptions: string[];
  suggestedName: string;
  suggestedPriceDiamonds: number;
  suggestedPriceCSCoins: number;
};

export type GenerateIconPromptsInput = {
  context: string;
  itemsRequested: string;
  colors: ExtractedBrandColors;
  style: IconStyleId;
  shape: IconShapeId;
  count: number;
};

export type GenerateAIIconsBatchInput = GenerateIconPromptsInput & {
  onProgress?: (message: string) => void;
};

export type GeneratedIconBriefing = {
  descriptions: string[];
  icons: GeneratedIcon[];
  suggestedName: string;
  suggestedPriceDiamonds: number;
  suggestedPriceCSCoins: number;
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

const GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash',
] as const;

const VERTEX_IMAGEN_LOCATION = 'us-central1';
const VERTEX_IMAGEN_MODEL = 'imagegeneration@006';

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

/** Vision call 1 — logo only, short JSON. */
const ANALYZE_BRAND_SYSTEM_PROMPT = [
  'You analyze brand logos for a design tool. Return ONLY strict JSON. No markdown, no code fences, no extra text.',
  'Keys must be exactly: contextDescription, primaryHex, secondaryHex, bgHex.',
  'contextDescription: Spanish, 1-3 short sentences: what the mark suggests (sport, club vibe, industry), mood, and visual personality.',
  'Do NOT invent or name real trademarked clubs, teams, or brands unless clearly readable in the image; otherwise stay generic (e.g. "club deportivo clásico").',
  'primaryHex, secondaryHex, bgHex: strings #RRGGBB UPPERCASE, the three dominant brand colors from the artwork (background may be a subtle neutral from the logo surround).',
].join('\n');

/** Text-only call 2 — icon prompts. */
const ICON_PROMPTS_SYSTEM_PROMPT = [
  'You write short English prompts for Google Vertex AI Imagen (app icons).',
  'Return ONLY strict JSON. No markdown, no code fences, no extra text.',
  'Root keys exactly: descriptions, suggestedName, suggestedPriceDiamonds, suggestedPriceCSCoins.',
  'descriptions: array of EXACTLY N strings in ENGLISH.',
  'Each string MUST be one complete sentence, 14-22 words, naming exactly ONE concrete object/icon.',
  'Each string MUST naturally include these three hex colors as uppercase tokens: PRIMARY SECONDARY BG (use the #RRGGBB values given in the user message).',
  'Each string MUST reflect the brand context and item list; distribute items across icons, repeating only if N > number of items.',
  'Forbidden in descriptions: grid, collage, sheet, mockup, UI screenshot, visible text, letters, words written on the icon, multiple unrelated objects in one icon.',
  'suggestedName: short commercial set name, Spanish or English, 1-4 words.',
  'suggestedPriceDiamonds: integer 1-50. suggestedPriceCSCoins: integer 100-5000.',
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

async function callGeminiJson(systemInstruction: string, userParts: Array<string | Part>, temperature: number): Promise<string> {
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

      const result = await model.generateContent(userParts);
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
    `No se pudo generar contenido con Gemini. Modelos intentados: ${attemptedModels.join(', ') || 'ninguno disponible'}. Ultimo error: ${detail}`,
  );
}

export async function generateThemeLogic(prompt: string): Promise<GeneratedThemeLogic> {
  const userPrompt = [
    `Prompt del admin: ${prompt || 'Skin premium profesional para Card-Social.'}`,
    'Devuelve solo el JSON solicitado.',
  ].join('\n');

  const rawText = await callGeminiJson(THEME_LOGIC_SYSTEM_PROMPT, [userPrompt], 0.75);
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

function normalizeBrandHex(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Gemini devolvio ${field} invalido.`);
  }
  const next = value.trim();
  if (!HEX_PATTERN.test(next)) {
    throw new Error(`Gemini devolvio ${field} con formato hex invalido: ${next}`);
  }
  return next.toUpperCase();
}

function parseBrandAnalysis(rawText: string): BrandAnalysisResult {
  const jsonText = extractJsonObject(rawText);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Gemini devolvio JSON mal formateado: ${error instanceof Error ? error.message : 'parse error'}. Respuesta: ${rawText.slice(0, 180)}`,
    );
  }

  const nested = parsed.extractedColors;
  const c = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : null;

  const primaryHex = normalizeBrandHex(c?.primaryHex ?? parsed.primaryHex, 'primaryHex');
  const secondaryHex = normalizeBrandHex(c?.secondaryHex ?? parsed.secondaryHex, 'secondaryHex');
  const bgHex = normalizeBrandHex(c?.bgHex ?? parsed.bgHex, 'bgHex');

  if (typeof parsed.contextDescription !== 'string' || !parsed.contextDescription.trim()) {
    throw new Error('Gemini no devolvio contextDescription valido.');
  }

  return {
    contextDescription: parsed.contextDescription.trim(),
    primaryHex,
    secondaryHex,
    bgHex,
  };
}

function parseIconPromptsBriefing(rawText: string, expected: number): IconPromptBriefing {
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
        descriptions.push(value.trim().replace(/\s+/g, ' '));
      } else if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const candidate = [obj.description, obj.text, obj.name].find(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        );
        if (candidate) descriptions.push(candidate.trim().replace(/\s+/g, ' '));
      }
    }
  }

  if (!descriptions.length) {
    throw new Error('Gemini no devolvio descripciones validas para los iconos.');
  }

  const filler = (i: number) =>
    `A single premium mobile app icon variation ${i + 1} with bold shapes, soft studio lighting, and cohesive brand colors, one isolated subject only, no text`;
  while (descriptions.length < expected) {
    descriptions.push(filler(descriptions.length));
  }

  const suggestedName =
    typeof parsed.suggestedName === 'string' && parsed.suggestedName.trim().length > 0
      ? parsed.suggestedName.trim()
      : 'AI Icon Set';

  return {
    descriptions: descriptions.slice(0, expected),
    suggestedName,
    suggestedPriceDiamonds: clampNumber(parsed.suggestedPriceDiamonds, 1, 50, 5),
    suggestedPriceCSCoins: clampNumber(parsed.suggestedPriceCSCoins, 100, 5000, 500),
  };
}

function toPalette(colors: ExtractedBrandColors): ExtractedBrandColors {
  return {
    primaryHex: colors.primaryHex.toUpperCase(),
    secondaryHex: colors.secondaryHex.toUpperCase(),
    bgHex: colors.bgHex.toUpperCase(),
  };
}

export async function analyzeBrandReference(base64: string, mimeType: string): Promise<BrandAnalysisResult> {
  const data = base64.trim();
  const mime = (mimeType || 'image/png').trim();
  if (!data) {
    throw new Error('Falta la imagen en base64 para analizar la marca.');
  }

  const parts: Part[] = [
    { inlineData: { mimeType: mime, data: data } },
    {
      text: [
        'Analiza este logo o marca en la imagen.',
        'Devuelve solo el JSON pedido: contexto en español y tres colores HEX exactos del arte.',
      ].join('\n'),
    },
  ];

  const rawText = await callGeminiJson(ANALYZE_BRAND_SYSTEM_PROMPT, parts, 0.35);
  return parseBrandAnalysis(rawText);
}

export async function generateIconPrompts(input: GenerateIconPromptsInput): Promise<IconPromptBriefing> {
  const count = clampIconCount(input.count);
  const colors = toPalette(input.colors);
  const ctx = (input.context || '').trim() || 'Tema general de marca deportiva o digital premium.';
  const items = (input.itemsRequested || '').trim() || 'icono abstracto de energia y equipo';

  const userText = [
    `N (descriptions length) = ${count}.`,
    `Brand context (Spanish, use as creative direction): ${ctx}`,
    `Items to depict (comma or list, Spanish or English): ${items}`,
    `Style for all icons: ${ICON_STYLE_LABELS[input.style]}. Container: ${ICON_SHAPE_LABELS[input.shape]}.`,
    `PRIMARY color: ${colors.primaryHex}. SECONDARY color: ${colors.secondaryHex}. BG color: ${colors.bgHex}.`,
    `Generate exactly ${count} English description strings as specified in the system rules.`,
  ].join('\n');

  const rawText = await callGeminiJson(ICON_PROMPTS_SYSTEM_PROMPT, [userText], 0.65);
  return parseIconPromptsBriefing(rawText, count);
}

function getVertexEnv() {
  const projectId = (import.meta.env.VITE_GCP_PROJECT_ID as string | undefined)?.trim() ?? '';
  const accessToken = (import.meta.env.VITE_GCP_ACCESS_TOKEN as string | undefined)?.trim() ?? '';
  return { projectId, accessToken };
}

function vertexIconPendingDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect fill="#64748b" width="256" height="256"/>
    <text x="128" y="132" text-anchor="middle" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="11" font-weight="700">Vertex AI Pending Config</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function vertexWallpaperPendingDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700">
    <rect fill="#64748b" width="400" height="700"/>
    <text x="200" y="352" text-anchor="middle" fill="#f1f5f9" font-family="system-ui,sans-serif" font-size="13" font-weight="700">Vertex AI Pending Config</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function vertexImagenPredictUrl(projectId: string) {
  return `https://${VERTEX_IMAGEN_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${VERTEX_IMAGEN_LOCATION}/publishers/google/models/${VERTEX_IMAGEN_MODEL}:predict`;
}

type VertexPredictionRaw = {
  bytes?: string;
  bytesBase64Encoded?: string;
  mimeType?: string;
};

async function vertexImagenPredict(
  instancePrompt: string,
  parameters: { sampleCount: number; aspectRatio: string },
): Promise<string | null> {
  const { projectId, accessToken } = getVertexEnv();
  if (!projectId || !accessToken) return null;

  const url = vertexImagenPredictUrl(projectId);
  const body = {
    instances: [{ prompt: instancePrompt }],
    parameters,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn('[Vertex Imagen] predict failed:', response.status, errText.slice(0, 400));
      return null;
    }

    const data = (await response.json()) as { predictions?: VertexPredictionRaw[] };
    const pred = data.predictions?.[0];
    const rawB64 = pred?.bytes ?? pred?.bytesBase64Encoded;
    if (!rawB64 || typeof rawB64 !== 'string') {
      console.warn('[Vertex Imagen] missing predictions[0].bytes / bytesBase64Encoded');
      return null;
    }
    const mime = pred?.mimeType && typeof pred.mimeType === 'string' ? pred.mimeType : 'image/png';
    return `data:${mime};base64,${rawB64}`;
  } catch (error) {
    console.warn('[Vertex Imagen] request error:', error);
    return null;
  }
}

export async function generateIconWithVertexAI(prompt: string, hexColorBackground: string): Promise<string> {
  const { projectId, accessToken } = getVertexEnv();
  if (!projectId || !accessToken) {
    return vertexIconPendingDataUrl();
  }

  let bg = (hexColorBackground || '#0B1220').trim();
  if (!HEX_PATTERN.test(bg)) bg = '#0B1220';

  const safePrompt = prompt.replace(/\s+/g, ' ').trim() || 'abstract premium app symbol';
  const instancePrompt = `A minimalist flat vector iOS app icon of ${safePrompt}, centered, solid background color ${bg}, dribbble style, high quality`;

  const dataUrl = await vertexImagenPredict(instancePrompt, { sampleCount: 1, aspectRatio: '1:1' });
  return dataUrl ?? vertexIconPendingDataUrl();
}

export async function generateAIIconsBatch(input: GenerateAIIconsBatchInput): Promise<GeneratedIconBriefing> {
  const onProgress = input.onProgress;
  onProgress?.('Gemini: generando descripciones de iconos...');

  const briefing = await generateIconPrompts(input);
  const bgHex = toPalette(input.colors).bgHex;

  onProgress?.('Vertex AI (Imagen): generando imagenes...');

  const urls = await Promise.all(briefing.descriptions.map((desc) => generateIconWithVertexAI(desc, bgHex)));

  const icons: GeneratedIcon[] = briefing.descriptions.map((description, index) => ({
    description,
    url: urls[index] ?? vertexIconPendingDataUrl(),
  }));

  onProgress?.('');

  return {
    descriptions: briefing.descriptions,
    icons,
    suggestedName: briefing.suggestedName,
    suggestedPriceDiamonds: briefing.suggestedPriceDiamonds,
    suggestedPriceCSCoins: briefing.suggestedPriceCSCoins,
  };
}

export async function generateAIWallpaper(prompt: string): Promise<string> {
  const { projectId, accessToken } = getVertexEnv();
  if (!projectId || !accessToken) {
    return vertexWallpaperPendingDataUrl();
  }

  const instancePrompt = `${prompt || 'premium mobile wallpaper'}, vertical mobile wallpaper, clean gradients, professional visual identity, no text, no letters`;
  const dataUrl = await vertexImagenPredict(instancePrompt, { sampleCount: 1, aspectRatio: '9:16' });
  return dataUrl ?? vertexWallpaperPendingDataUrl();
}
