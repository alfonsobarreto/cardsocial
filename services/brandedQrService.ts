/**
 * Branded QR Service
 * Genera QR codes con logo central + opciones de descarga (PNG/PDF)
 * Para Business Cards: QR permanente + logo del negocio en el centro
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { resolveSignatureCardPublicOrigin, resolveSignatureQrImageHostOrigin } from './emailSignaturePublicBase';

/**
 * En React Native no hay canvas ni módulos Node (`stream` en pngjs). Solo usamos
 * `qrcode` core + render SVG (sin pngjs, sin `qrcode/lib/server`).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCore: { create: (data: string, options?: QrCreateOpts) => QrData } = require('qrcode/lib/core/qrcode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRSvg: { render: (qrData: QrData, options?: QrRenderOpts) => string } = require('qrcode/lib/renderer/svg-tag');

type QrCreateOpts = { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' };
type QrData = { modules: { size: number; data: Uint8Array } };
type QrRenderOpts = {
  errorCorrectionLevel?: string;
  margin?: number;
  color?: { dark?: string; light?: string };
  width?: number;
};

function buildQrSvgString(data: string, widthPx: number): string {
  const opts: QrRenderOpts = {
    errorCorrectionLevel: 'H',
    margin: 1,
    color: { dark: '#0A2540', light: '#FFFFFF' },
    width: widthPx,
  };
  const qr = QRCore.create(String(data), { errorCorrectionLevel: 'H' });
  return QRSvg.render(qr, opts);
}

/** Misma idea que Gift Mint: el archivo no “aparece” solo; hay que abrir el panel del sistema. */
async function tryShareExportedFile(
  fileUri: string,
  opts: { mimeType: string; dialogTitle: string }
): Promise<boolean> {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: opts.mimeType, dialogTitle: opts.dialogTitle });
      return true;
    }
  } catch (e) {
    console.warn('[brandedQrService] shareAsync', e);
  }
  if (Platform.OS === 'android') {
    try {
      const url = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
      await Share.share({ url, title: opts.dialogTitle });
      return true;
    } catch (e) {
      console.warn('[brandedQrService] Share.share', e);
    }
  }
  return false;
}

/**
 * Acepta `data:image/png;base64,...` o base64 puro. En `react-native-svg` 15, `Svg#toDataURL`
 * entrega al callback un string **solo base64** (ver `RNSVGSvgViewModule` / `svg.tsx`); si solo
 * buscábamos el prefijo `data:...`, el parse fallaba y se caía al fallback SVG.
 */
function extractPngBase64ForWrite(src: string): string | null {
  const trimmed = String(src || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^data:image\/png;base64,([\s\S]+)$/i);
  if (m?.[1]) {
    return m[1].replace(/\s/g, '');
  }
  if (trimmed.toLowerCase().startsWith('data:') && trimmed.includes('base64,')) {
    const i = trimmed.indexOf('base64,');
    const b = trimmed.slice(i + 'base64,'.length).replace(/\s/g, '');
    if (b) return b;
  }
  const noWs = trimmed.replace(/\s/g, '');
  if (noWs.length > 32 && /^[A-Za-z0-9+/=_-]+$/.test(noWs)) {
    return noWs;
  }
  return null;
}

/**
 * Graba un PNG a partir de un data URL o base64 puro (p. ej. `react-native-qrcode-svg` + `getRef`
 * → `toDataURL`) y abre el menú de compartir. Si falla, el caller puede seguir con {@link ExportBusinessQR}.
 */
export async function shareBusinessQrPngDataUrl(
  dataUrl: string,
  bcName: string
): Promise<BrandedQrResult> {
  try {
    const base64 = extractPngBase64ForWrite(dataUrl);
    if (!base64) {
      return {
        success: false,
        message: 'Formato de imagen no válido (se esperaba PNG en base64 o data URL).',
      };
    }
    const sanitizedName = String(bcName || 'business')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `PERMANENT_QR_${sanitizedName}_${Date.now()}.png`;

    const downloadDir = getQrExportDirectory();
    await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    const filePath = `${downloadDir}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const shared = await tryShareExportedFile(filePath, {
      mimeType: 'image/png',
      dialogTitle: 'Card-Social — QR permanente',
    });
    const shareHint = shared
      ? 'Se abrió el menú del sistema: podés guardar en Fotos, Archivos o compartir el PNG.\n\n'
      : 'No se pudo abrir el menú. El PNG se generó en caché de la app; podés reintentar compartir.\n\n';

    return {
      success: true,
      fileUri: filePath,
      fileName,
      mimeType: 'image/png',
      message: `${shareHint}Archivo: ${fileName} (raster)`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error al exportar PNG: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export interface BrandedQrGenerationParams {
  bId: string;
  bcName: string;
  uid: string;
  /** URI local del logo (preview / centro del QR). */
  bcLogo?: string;
  cardQrDataUrl: string; // Payload del QR o data URL
  format: 'png' | 'pdf'; // Formato de descarga
}

export interface BrandedQrResult {
  success: boolean;
  fileUri?: string; // URI del archivo generado
  fileName?: string;
  message: string;
  mimeType?: string;
}

export interface ExportBusinessQrParams {
  businessId: string;
  bcName: string;
  permanentBusinessLink: string;
  bcLogo?: string;
  format: 'png' | 'pdf';
}

/** Directorio escribible (iOS/Android); nunca usar `/tmp/...` — no es válido en RN. */
function getQrExportDirectory(): string {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) {
    throw new Error('No hay directorio de caché disponible para exportar el QR.');
  }
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}QRCodes/`;
}

const TARGET_DPI = 300;
const MIN_QR_CM = 2;
const CM_TO_INCH = 2.54;
// 2 cm @ 300 DPI = 236 px (mínimo para impresión real).
const MIN_QR_PX_AT_300_DPI = Math.ceil((MIN_QR_CM / CM_TO_INCH) * TARGET_DPI);
const DEFAULT_EXPORT_PX = Math.max(1200, MIN_QR_PX_AT_300_DPI);

/**
 * Genera URL de QR con parámetros codificados
 * Formato: card-social://qr/{bId}?business={bcName}&uid={uid}
 */
export function generateQrDataUrl(bId: string, bcName: string, uid: string): string {
  const encodedBusiness = encodeURIComponent(bcName);
  return `card-social://qr/${bId}?business=${encodedBusiness}&uid=${encodeURIComponent(uid)}`;
}

const DEFAULT_PUBLIC_BUSINESS_WEB_BASE = 'https://cardsocial.me';

/**
 * Base pública (HTTPS) para el QR de negocio: abre en navegador y en App Links.
 * Override: `EXPO_PUBLIC_BUSINESS_WEB_BASE` (sin barra final).
 */
export function getPublicBusinessWebBaseUrl(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BUSINESS_WEB_BASE
      ? String(process.env.EXPO_PUBLIC_BUSINESS_WEB_BASE).trim()
      : '';
  return (fromEnv || DEFAULT_PUBLIC_BUSINESS_WEB_BASE).replace(/\/+$/, '');
}

const LOOPBACK_SMART_UNIVERSAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * QR Smart 24 h (`/u/{token}`): si el servidor devolvió loopback, cambia el origen a
 * `EXPO_PUBLIC_BUSINESS_WEB_BASE` (misma base que el QR de negocio “Copiar enlace web”) para que el
 * enlace / QR sean usables en LAN desde el móvil.
 */
export function rewriteLoopbackSmartCardUniversalUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return s;
    if (!LOOPBACK_SMART_UNIVERSAL_HOSTS.has(u.hostname.toLowerCase())) return s;
    const base = getPublicBusinessWebBaseUrl().replace(/\/+$/, '');
    return `${base}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return s;
  }
}

/**
 * Origen HTTPS público solo para firma correo (`/b/…`), sin LAN/`http`.
 * Override: `EXPO_PUBLIC_BUSINESS_SIGNATURE_PUBLIC_BASE` o `SIGNATURE_EMAIL_PUBLIC_SITE_BASE` (solo servidor Next).
 */
export function getPublicBusinessWebBaseUrlForEmailSignature(): string {
  return resolveSignatureCardPublicOrigin();
}

/** Misma URL pública permanente pero forzando origen válido para clientes de correo. */
export function generatePublicBusinessWebUrlForEmailSignature(bId: string, uid: string): string {
  const b = encodeURIComponent(String(bId || '').trim());
  const u = encodeURIComponent(String(uid || '').trim());
  return `${resolveSignatureCardPublicOrigin()}/b/${b}?uid=${u}`;
}

/**
 * Host del PNG del QR en firma (`GET /api/qr/generate`).
 * Si la app está en LAN/`http`, usa `https://cardsocial.me` (o overrides públicos HTTPS).
 */
export function getSignatureQrImageBaseUrl(): string {
  const cardOrigin = resolveSignatureCardPublicOrigin();
  return resolveSignatureQrImageHostOrigin(cardOrigin);
}

/**
 * URL HTTPS permanente: misma ficha pública en web; la app sigue canjeando con uid + bId.
 * Impresión / cámara del sistema abren el navegador; la app in-app reconoce la misma URL.
 */
export function generatePublicBusinessWebUrl(bId: string, uid: string): string {
  const b = encodeURIComponent(String(bId || '').trim());
  const u = encodeURIComponent(String(uid || '').trim());
  return `${getPublicBusinessWebBaseUrl()}/b/${b}?uid=${u}`;
}

/**
 * Deep link de app (legacy / intent filters). Sigue soportado por el escáner.
 * Preferir `generatePublicBusinessWebUrl` en QRs mostrados al usuario.
 */
export function generatePermanentBusinessLink(bId: string, uid: string): string {
  return `card-social://business/${bId}?uid=${encodeURIComponent(uid)}&mode=permanent`;
}

/**
 * Descarga QR como PNG o PDF
 * 
 * Parámetros:
 * - cardQrDataUrl: SVG o imagen base64 del QR generado
 * - bcName: Título de la tarjeta business (para nombre del archivo)
 * - format: 'png' o 'pdf'
 * - bcLogo: (Opcional) Logo para embeber en el centro del QR
 */
export async function downloadBrandedQr(
  params: BrandedQrGenerationParams
): Promise<BrandedQrResult> {
  try {
    const { bId, bcName, uid, cardQrDataUrl, format, bcLogo } = params;

    // Sanitizar nombre para el archivo
    const sanitizedName = bcName
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `QR_${sanitizedName}_${Date.now()}.svg`;

    const downloadDir = getQrExportDirectory();
    await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });

    const filePath = `${downloadDir}${fileName}`;

    const qrPayload =
      cardQrDataUrl.startsWith('data:') || cardQrDataUrl.startsWith('file://')
        ? generateQrDataUrl(bId, bcName, uid)
        : cardQrDataUrl;

    if (bcLogo && format === 'png') {
      try {
        await FileSystem.readAsStringAsync(bcLogo, {
          encoding: 'base64',
        } as any);
        // Composición de logo: pendiente; el QR usa nivel H.
      } catch (logoError) {
        console.warn('Logo embedding failed, using base QR', logoError);
      }
    }

    const svg = buildQrSvgString(qrPayload, 1200);
    await FileSystem.writeAsStringAsync(filePath, svg, { encoding: FileSystem.EncodingType.UTF8 });
    const shared = await tryShareExportedFile(filePath, {
      mimeType: 'image/svg+xml',
      dialogTitle: 'Card-Social — QR',
    });
    const shareHint = shared
      ? 'Se abrió el menú del sistema: elegí "Guardar en Archivos" (iOS) o compartir el SVG.\n\n'
      : 'No se pudo abrir el menú. Podés abrir un gestor de archivos; el SVG está en caché de la app.\n\n';

    return {
      success: true,
      fileUri: filePath,
      fileName,
      mimeType: 'image/svg+xml',
      message: `${shareHint}Archivo: ${fileName}\nNivel de corrección: H (vectorial)`,
    };
  } catch (error) {
    console.error('Error downloading branded QR:', error);
    return {
      success: false,
      message: `Error al descargar QR: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Exporta QR permanente de negocio como **SVG** (vector) con `qrcode` (core + svg-tag).
 * `format` se conserva en la API por compatibilidad; el raster **PNG** del mismo QR
 * con logo (misma apariencia que en pantalla) se obtiene con `getRef` + `toDataURL` y
 * {@link shareBusinessQrPngDataUrl}.
 * Garantiza ancho de export vectorial mín. ~2 cm a 300 DPI.
 */
export async function ExportBusinessQR(
  params: ExportBusinessQrParams
): Promise<BrandedQrResult> {
  try {
    const sanitizedName = String(params.bcName || 'business')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    const fileName = `PERMANENT_QR_${sanitizedName}_${Date.now()}.svg`;

    const downloadDir = getQrExportDirectory();
    await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    const filePath = `${downloadDir}${fileName}`;

    const svg = buildQrSvgString(params.permanentBusinessLink, DEFAULT_EXPORT_PX);
    await FileSystem.writeAsStringAsync(filePath, svg, { encoding: FileSystem.EncodingType.UTF8 });
    const shared = await tryShareExportedFile(filePath, {
      mimeType: 'image/svg+xml',
      dialogTitle: 'Card-Social — QR permanente',
    });
    const shareHint = shared
      ? 'Se abrió el menú del sistema: guardá o compartí el SVG (p. ej. "Guardar en Archivos" en iPhone).\n\n'
      : 'No se pudo abrir el menú de compartir. El archivo sí se generó; ruta en caché de la app abajo.\n\n';

    return {
      success: true,
      fileUri: filePath,
      fileName,
      mimeType: 'image/svg+xml',
      message:
        `${shareHint}QR vectorial: ${DEFAULT_EXPORT_PX}px; corrección H. Referencia imprenta: ≥ ${MIN_QR_CM}cm a ${TARGET_DPI} DPI.\n` +
        `Archivo: ${fileName}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error al exportar QR permanente: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Genera preview del QR branded (para visualizar antes de descargar)
 */
export function generateQrPreviewUrl(
  qrDataUrl: string,
  bcLogo?: string,
  includeBcName?: string
): string {
  // En una app real, esto generaría un canvas combinado
  // Por ahora, retorna el QR base
  return qrDataUrl;
}

/**
 * Calcula especificaciones de impresión
 * Para mejorar la calidad del sticker impreso
 */
export interface PrintSpecifications {
  qrSize: string; // "2x2", "3x3", "4x4" pulgadas
  logoSize: string; // Porcentaje del QR (recomendado: 20-30%)
  dpi: number; // Resolución recomendada: 300 DPI para stickers
  paperType: string; // "glossy", "matte", "roll"
  cutMargin: string; // "0.25 inch" recomendado
}

export function getPrintSpecifications(businessType: 'retail' | 'service' | 'restaurant'): PrintSpecifications {
  const specs: Record<string, PrintSpecifications> = {
    retail: {
      qrSize: '2x2',
      logoSize: '25%',
      dpi: 300,
      paperType: 'glossy',
      cutMargin: '0.25 inch',
    },
    service: {
      qrSize: '2x2',
      logoSize: '20%',
      dpi: 300,
      paperType: 'matte',
      cutMargin: '0.25 inch',
    },
    restaurant: {
      qrSize: '3x3',
      logoSize: '30%',
      dpi: 300,
      paperType: 'glossy',
      cutMargin: '0.25 inch',
    },
  };

  return specs[businessType] || specs['retail'];
}

/**
 * Utilidad: Compartir QR a través de sistemas nativos (WhatsApp, Email, etc.)
 */
export async function shareQrCode(
  fileUri: string,
  bcName: string
): Promise<boolean> {
  try {
    // En React Native, usarías Share.share() de react-native
    // Esta es una abstracción placeholder
    console.log(`Compartiendo QR de ${bcName} desde ${fileUri}`);
    return true;
  } catch (error) {
    console.error('Error sharing QR:', error);
    return false;
  }
}
