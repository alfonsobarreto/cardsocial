import { S3Client } from '@aws-sdk/client-s3';

// =============================================================================
// ⚠️  BACKEND ONLY — Este cliente NUNCA debe ejecutarse en el dispositivo del
// usuario. DO_SPACES_KEY y DO_SPACES_SECRET solo existen en el .env del backend
// (Azure App Service / Node.js). En Expo, process.env.DO_SPACES_KEY es undefined
// y todas las llamadas S3 fallarían con auth error.
//
// Para uploads desde la app: llama al backend vía fetch('/api/admin/mint_asset').
// =============================================================================

if (!process.env.DO_SPACES_KEY) {
  // En Expo/React Native esto siempre es true (no EXPO_PUBLIC_ prefix = undefined).
  // Loggeamos un warning para que sea obvio en desarrollo, pero no rompemos la app
  // porque las funciones de lectura de wallpaperService.ts no usan este cliente.
  console.warn(
    '[spacesClient] DO_SPACES_KEY no encontrada. ' +
    'Las funciones de upload NO funcionarán desde este contexto. ' +
    'Usa el endpoint del backend para subir archivos.'
  );
}

const spacesEndpoint = process.env.DO_SPACES_ENDPOINT || 'sfo3.digitaloceanspaces.com';

export const s3 = new S3Client({
  region: process.env.DO_SPACES_REGION || 'sfo3',
  endpoint: `https://${spacesEndpoint}`,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY || '',
    secretAccessKey: process.env.DO_SPACES_SECRET || '',
  },
  forcePathStyle: false,
});
