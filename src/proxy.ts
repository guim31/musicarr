import { NextResponse, type NextRequest } from 'next/server';
import { isCrossSiteWrite } from '@/lib/csrf';

/**
 * Refuse les requêtes d'écriture intersites sur l'API (voir `lib/csrf.ts`).
 *
 * Les lectures et les clients sans en-tête d'origine (script cron, `curl`)
 * ne sont pas concernés.
 */
export function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request.method, request.headers)) {
    return NextResponse.json({ error: 'Requête intersite refusée' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
