import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from './origin-guard';

describe('isAllowedOrigin (Anti-CSRF Origin Guard)', () => {
  it('should always allow safe read methods (GET, HEAD, OPTIONS)', () => {
    expect(isAllowedOrigin({ method: 'GET', origin: 'https://evil.com', host: 'meu-comercio.vercel.app' })).toBe(true);
    expect(isAllowedOrigin({ method: 'HEAD', origin: 'https://evil.com', host: 'meu-comercio.vercel.app' })).toBe(true);
    expect(isAllowedOrigin({ method: 'OPTIONS', origin: 'https://evil.com', host: 'meu-comercio.vercel.app' })).toBe(true);
  });

  it('should allow mutating requests when Origin matches Host exactly', () => {
    const allowed = isAllowedOrigin({
      method: 'POST',
      origin: 'https://meu-comercio-rho.vercel.app',
      host: 'meu-comercio-rho.vercel.app',
    });
    expect(allowed).toBe(true);
  });

  it('should reject mutating requests from malicious external origins', () => {
    const blocked = isAllowedOrigin({
      method: 'POST',
      origin: 'https://attacker-phishing-site.com',
      host: 'meu-comercio-rho.vercel.app',
    });
    expect(blocked).toBe(false);
  });

  it('should fall back to Referer when Origin is absent', () => {
    const allowed = isAllowedOrigin({
      method: 'POST',
      origin: null,
      referer: 'https://meu-comercio-rho.vercel.app/gestao',
      host: 'meu-comercio-rho.vercel.app',
    });
    expect(allowed).toBe(true);

    const blocked = isAllowedOrigin({
      method: 'POST',
      origin: null,
      referer: 'https://evil-site.com/attack',
      host: 'meu-comercio-rho.vercel.app',
    });
    expect(blocked).toBe(false);
  });

  it('should allow local development requests on localhost', () => {
    const allowed = isAllowedOrigin({
      method: 'POST',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    });
    expect(allowed).toBe(true);
  });

  it('should reject invalid or malformed origin URLs', () => {
    const blocked = isAllowedOrigin({
      method: 'POST',
      origin: 'not-a-valid-url',
      host: 'meu-comercio-rho.vercel.app',
    });
    expect(blocked).toBe(false);
  });
});
