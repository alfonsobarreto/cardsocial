// testUpload.js - Prueba de subida a DigitalOcean Spaces
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const AWS = require('aws-sdk');

const SPACES_KEY = process.env.SPACES_KEY;
const SPACES_SECRET = process.env.SPACES_SECRET;
const SPACES_ENDPOINT = process.env.SPACES_ENDPOINT;
const SPACES_BUCKET = process.env.SPACES_BUCKET;
const SPACES_REGION = process.env.SPACES_REGION || 'sfo3';

if (!SPACES_ENDPOINT) {
  console.error('❌ SPACES_ENDPOINT no está definido.');
  process.exit(1);
}

const endpoint = new AWS.Endpoint(SPACES_ENDPOINT);
const s3 = new AWS.S3({
  endpoint,
  accessKeyId: SPACES_KEY,
  secretAccessKey: SPACES_SECRET,
  region: SPACES_REGION,
  signatureVersion: 'v4',
});

async function uploadTestImage() {
  const testImagePath = path.join(__dirname, 'test-image.png');
  // Si no existe, crea una imagen PNG mínima
  if (!fs.existsSync(testImagePath)) {
    const pngData = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
      '1f15c4890000000a49444154789c6360000002000100' +
      '05fe02fea70000000049454e44ae426082',
      'hex'
    );
    fs.writeFileSync(testImagePath, pngData);
  }
  const fileContent = fs.readFileSync(testImagePath);
  const fileName = `test-upload-${Date.now()}.png`;
  const params = {
    Bucket: SPACES_BUCKET,
    Key: fileName,
    Body: fileContent,
    ACL: 'public-read',
    ContentType: 'image/png',
  };
  try {
    await s3.putObject(params).promise();
    const publicUrl = `https://${SPACES_BUCKET}.${SPACES_ENDPOINT}/${fileName}`;
    console.log('✅ Imagen subida correctamente. URL pública:', publicUrl);
    return publicUrl;
  } catch (err) {
    console.error('❌ Error al subir la imagen:', err);
    throw err;
  }
}

uploadTestImage().then(url => {
  console.log('Abre esta URL en tu navegador:', url);
}).catch(() => {
  process.exit(1);
});
