import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: async () => store }));

import { clearSessionCookie, setSessionCookie } from './auth-context';
import { getSessionCookieName } from './session';

describe('clearSessionCookie', () => {
  beforeEach(() => {
    store.set.mockReset();
    store.delete.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('expires the cookie with the same attributes it was set with, Secure included in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await setSessionCookie('token');
    await clearSessionCookie();

    const [, , setOptions] = store.set.mock.calls[0];
    const [name, value, clearOptions] = store.set.mock.calls[1];
    expect(name).toBe('__Host-MEU_COMERCIO_SESSION');
    expect(value).toBe('');
    // A browser refuses to remove a "__Host-" cookie unless the expiry is Secure, has Path=/ and no Domain.
    expect(clearOptions).toMatchObject({ secure: true, path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
    expect(clearOptions).not.toHaveProperty('domain');
    expect(clearOptions).toMatchObject({ secure: setOptions.secure, path: setOptions.path });
  });

  it('does not use delete(), which sends the expiry without Secure', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await clearSessionCookie();

    expect(store.delete).not.toHaveBeenCalled();
  });

  it('clears the plain cookie outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await clearSessionCookie();

    expect(store.set).toHaveBeenCalledWith(
      getSessionCookieName(),
      '',
      expect.objectContaining({ secure: false, path: '/', maxAge: 0 })
    );
    expect(getSessionCookieName()).toBe('MEU_COMERCIO_SESSION');
  });
});
