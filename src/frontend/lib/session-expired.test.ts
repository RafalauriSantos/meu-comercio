import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  isSessionExpiry,
  isSessionExpired,
  notifySessionExpired,
  clearSessionExpired,
  subscribeSessionExpired,
} from './session-expired';
import { apiRequest, ApiError } from './api-client';

describe('isSessionExpiry', () => {
  it('is true for a 401 on an authenticated route', () => {
    for (const path of ['/api/products', '/api/sales', '/api/auth/me', '/api/cash/current']) {
      expect(isSessionExpiry(401, path)).toBe(true);
    }
  });

  it('is false for a 401 on login, register and setup', () => {
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/setup/owner', '/api/setup/status']) {
      expect(isSessionExpiry(401, path)).toBe(false);
    }
  });

  it('is false for every other status', () => {
    for (const status of [400, 403, 404, 409, 429, 500, 503]) {
      expect(isSessionExpiry(status, '/api/products')).toBe(false);
    }
  });
});

describe('session expired signal', () => {
  beforeEach(() => clearSessionExpired());

  it('notifies once, however many calls fail, and clears', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionExpired(listener);

    notifySessionExpired();
    notifySessionExpired();
    expect(isSessionExpired()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    clearSessionExpired();
    expect(isSessionExpired()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    notifySessionExpired();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('apiRequest and the session expired signal', () => {
  beforeEach(() => clearSessionExpired());
  afterEach(() => vi.unstubAllGlobals());

  const respondWith = (status: number) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Não autorizado' }), { status })));

  it('signals a 401 on an authenticated route and still throws the error', async () => {
    respondWith(401);

    const error = await apiRequest('/api/products').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(isSessionExpired()).toBe(true);
  });

  it('does not signal a wrong password on login, register or setup', async () => {
    respondWith(401);
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/setup/owner']) {
      await apiRequest(path, { method: 'POST' }).catch(() => undefined);
    }
    expect(isSessionExpired()).toBe(false);
  });

  it('does not signal 403, 404, 429, 500, 503 or a network failure', async () => {
    for (const status of [403, 404, 429, 500, 503]) {
      respondWith(status);
      await apiRequest('/api/products').catch(() => undefined);
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await apiRequest('/api/products').catch(() => undefined);

    expect(isSessionExpired()).toBe(false);
  });
});
