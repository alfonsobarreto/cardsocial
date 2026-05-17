import type { User } from 'firebase/auth';

import { adminBearer, readErrBody } from './adminApiAuth';

export type MediaUploadResult = {
  ok: true;
  url: string;
  filename: string;
  mime: string;
  path?: string;
};

export async function uploadAdminMedia(firebaseUser: User, file: File): Promise<MediaUploadResult> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.system');
  const body = new FormData();
  body.append('file', file, file.name);
  const res = await fetch(`${base}/api/admin/media/upload`, {
    method: 'POST',
    headers: {
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(await readErrBody(res));
  }
  const json = (await res.json()) as MediaUploadResult & { ok?: boolean };
  if (!json?.ok || !json.url) {
    throw new Error('Invalid upload response');
  }
  return json;
}
