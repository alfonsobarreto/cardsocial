import { NextRequest, NextResponse } from 'next/server';

import {
  buildUniversalCardVcardBody,
  universalCardVcardFilename,
} from '@/lib/buildBusinessCardVcard';
import {
  canonicalUniversalCardWebUrl,
  fetchPublicUniversalCardForWeb,
  vcardResponseHeaders,
} from '@/lib/publicCardFetch';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return new NextResponse('Missing token', { status: 400 });
  }

  const card = await fetchPublicUniversalCardForWeb(token);
  if (!card) {
    return new NextResponse('Not found', { status: 404 });
  }

  const canonicalUrl = canonicalUniversalCardWebUrl(req.nextUrl.origin, token);
  const body = buildUniversalCardVcardBody(card, canonicalUrl);
  const filename = universalCardVcardFilename(card);

  return new NextResponse(body, { headers: vcardResponseHeaders(filename) });
}
