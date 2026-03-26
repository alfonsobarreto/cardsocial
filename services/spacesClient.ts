import { S3Client } from '@aws-sdk/client-s3';

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
