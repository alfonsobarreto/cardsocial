import { NextRequest, NextResponse } from 'next/server';

import {
  buildBusinessCardVcardBody,
  businessCardVcardFilename,
} from '@/lib/buildBusinessCardVcard';
import {
  canonicalBusinessCardWebUrl,
  fetchPublicBusinessCardForWeb,
  vcardResponseHeaders,
} from '@/lib/publicCardFetch';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const bId = req.nextUrl.searchParams.get('bId')?.trim();
  const uid = req.nextUrl.searchParams.get('uid')?.trim();
  if (!bId || !uid) {
    return new NextResponse('Missing bId or uid', { status: 400 });
  }

  const card = await fetchPublicBusinessCardForWeb(bId, uid);
  if (!card) {
    return new NextResponse('Not found', { status: 404 });
  }

  const canonicalUrl = canonicalBusinessCardWebUrl(req.nextUrl.origin, bId, uid);
  const body = buildBusinessCardVcardBody(card, canonicalUrl);
  const filename = businessCardVcardFilename(card);

  return new NextResponse(body, { headers: vcardResponseHeaders(filename) });
}
