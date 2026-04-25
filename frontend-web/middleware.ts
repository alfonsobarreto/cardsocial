import { NextResponse, type NextRequest } from 'next/server';
import { STUDIO_AUTH_COOKIE } from '@/lib/studioAuthShared';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!pathname.startsWith('/studio')) {
    return NextResponse.next();
  }
  if (pathname === '/studio') {
    return NextResponse.redirect(new URL('/studio/bunker', req.url));
  }
  const hasStudioSession = req.cookies.get(STUDIO_AUTH_COOKIE)?.value === '1';
  if (!hasStudioSession) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/studio/:path*'],
};
