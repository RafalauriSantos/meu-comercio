import { describe, it, expect } from 'vitest';
import {
  classifyStatus,
  fallbackMessage,
  goesToLogin,
  timeoutFor,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from './api-error';

describe('classifyStatus', () => {
  it('401 on an authenticated route is an expired session', () => {
    expect(classifyStatus(401, '/api/auth/me')).toBe('session-expired');
  });

  it('401 on login, register and setup is a business error (wrong password), not an expired session', () => {
    expect(classifyStatus(401, '/api/auth/login')).toBe('business');
    expect(classifyStatus(401, '/api/auth/register')).toBe('business');
    expect(classifyStatus(401, '/api/setup/owner')).toBe('business');
  });

  it('429 is the rate limit, 5xx is a server error, other 4xx are business rules', () => {
    expect(classifyStatus(429, '/api/products')).toBe('rate-limit');
    expect(classifyStatus(500, '/api/products')).toBe('server');
    expect(classifyStatus(503, '/api/products')).toBe('server');
    for (const status of [400, 403, 404, 409, 422]) expect(classifyStatus(status, '/api/products')).toBe('business');
  });
});

describe('goesToLogin: only an expired session', () => {
  it('is true for session-expired and false for every other kind', () => {
    expect(goesToLogin('session-expired')).toBe(true);
    for (const kind of ['network', 'timeout', 'rate-limit', 'server', 'business'] as const) {
      expect(goesToLogin(kind)).toBe(false);
    }
  });
});

describe('fallbackMessage', () => {
  it('has a clear Portuguese message per kind', () => {
    expect(fallbackMessage('network')).toBe('Sem conexão com a internet. Confira a conexão e tente de novo.');
    expect(fallbackMessage('timeout')).toBe('A conexão está lenta. Tente de novo.');
    expect(fallbackMessage('rate-limit')).toBe('Muitas tentativas seguidas. Espere um instante e tente de novo.');
    expect(fallbackMessage('server')).toBe('O sistema teve um problema. Tente de novo em instantes.');
    expect(fallbackMessage('business')).toBe('Falha ao processar solicitação.');
  });
});

describe('timeoutFor: the time limit by route', () => {
  it('reads (GET, HEAD) wait 15 s and other writes wait 30 s', () => {
    expect(READ_TIMEOUT_MS).toBe(15_000);
    expect(WRITE_TIMEOUT_MS).toBe(30_000);
    expect(timeoutFor('GET', '/api/products?q=a')).toBe(15_000);
    expect(timeoutFor('HEAD', '/api/products')).toBe(15_000);
    expect(timeoutFor('POST', '/api/cash/open')).toBe(30_000);
    expect(timeoutFor('PATCH', '/api/products/1')).toBe(30_000);
  });

  it('a sale and the cancel of a sale have NO time limit: the client must not give up on a sale that may be saved', () => {
    expect(timeoutFor('POST', '/api/sales')).toBeNull();
    expect(timeoutFor('post', '/api/sales')).toBeNull();
    expect(timeoutFor('POST', '/api/sales/abc-123/cancel')).toBeNull();
  });

  it('reading a sale or the recent sales keeps the read limit', () => {
    expect(timeoutFor('GET', '/api/sales/abc-123')).toBe(15_000);
    expect(timeoutFor('GET', '/api/sales/recent')).toBe(15_000);
  });
});
