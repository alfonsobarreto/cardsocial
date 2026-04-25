import { NextResponse, type NextRequest } from 'next/server';

/**
 * /studio: solo reglas de ruta. La autenticación la resuelve el cliente (Firebase + cookie de apoyo);
 * exigir cookie aquí hacía que gente con sesión persistente en el navegador cayera en /login
 * aun con UID válido, y el `next` nunca debía reenviar a otra origen (p. ej. localhost:3001 en prod).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/studio')) {
    return NextResponse.next();
  }
  if (pathname === '/studio' || pathname === '/studio/') {
    return NextResponse.redirect(new URL('/studio/bunker', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/studio/:path*'],
};
