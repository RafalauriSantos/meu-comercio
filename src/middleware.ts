import { NextRequest, NextResponse } from 'next/server';
import { SlidingWindowRateLimiter } from '@/shared/infrastructure/security/rate-limiter';
import { isAllowedOrigin } from '@/shared/infrastructure/security/origin-guard';

const authLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
});

const apiLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 180,
});

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Anti-CSRF Origin Guard on mutating requests
  const method = request.method;
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const referer = request.headers.get('referer');

  if (!isAllowedOrigin({ method, origin, host, referer })) {
    return NextResponse.json(
      { error: 'Acesso rejeitado por verificação de segurança de origem (CSRF).' },
      { status: 403 }
    );
  }

  // 2. IP-based Rate Limiting on API endpoints
  if (pathname.startsWith('/api/')) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('x-real-ip') || '127.0.0.1';

    const isAuthRoute = pathname.startsWith('/api/auth/') || pathname.startsWith('/api/setup/');
    const limiter = isAuthRoute ? authLimiter : apiLimiter;
    const limitResult = limiter.check(`${clientIp}:${isAuthRoute ? 'auth' : 'api'}`);

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Muitas requisições em curto intervalo. Aguarde alguns segundos antes de tentar novamente.',
          retryAfter: limitResult.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(limitResult.retryAfterSeconds),
            'X-RateLimit-Limit': String(limitResult.limit),
            'X-RateLimit-Remaining': String(limitResult.remaining),
            'X-RateLimit-Reset': String(limitResult.resetTimeMs),
          },
        }
      );
    }
  }

  // 3. Security Response Headers
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
