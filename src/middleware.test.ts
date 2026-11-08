import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('Next.js Middleware Hardening', () => {
  it('should block non-allowed cross-origin mutation requests with HTTP 403', () => {
    const req = new NextRequest('http://localhost:3000/api/sales', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://malicious-site.com',
      },
    });

    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it('should allow legitimate same-origin read requests and set security headers', () => {
    const req = new NextRequest('http://localhost:3000/api/products', {
      method: 'GET',
      headers: {
        host: 'localhost:3000',
      },
    });

    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should enforce strict rate limit of 5 req/min on authentication routes', () => {
    const testIp = '192.168.10.50';

    // 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'x-forwarded-for': testIp,
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    }

    // 6th request is throttled
    const blockedReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'x-forwarded-for': testIp,
      },
    });
    const blockedRes = middleware(blockedReq);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get('Retry-After')).toBeDefined();
  });
});
