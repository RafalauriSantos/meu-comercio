import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = { set: vi.fn(), get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => Promise.resolve(),
}));

vi.mock('@/modules/users/infrastructure/drizzle-credentials-version', () => ({ getCredentialsChangedAt: async () => null }));

import { getCurrentSession, requireAuthSession } from './auth-context';
import { createSessionToken, getSessionCookieName, verifySessionToken } from './session';
import { GET as me } from '@/app/api/auth/me/route';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-11-16T08:00:00Z').getTime();
const user = { username: 'tatiane', merchantId: 'merchant-123', authorities: ['ROLE_OWNER' as const] };

describe('session renewal on use', () => {
  let token: string;

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 'test-session-secret-with-at-least-32-chars');
    store.set.mockReset();
    store.get.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    token = createSessionToken(user);
    store.get.mockReturnValue({ value: token });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('requireAuthSession rewrites cookie and token after more than 1h, with the same lifetime', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.setSystemTime(T0 + HOUR + 1000);

    await requireAuthSession();

    expect(store.set).toHaveBeenCalledTimes(1);
    const [name, newToken, options] = store.set.mock.calls[0];
    expect(name).toBe('__Host-MEU_COMERCIO_SESSION');
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 2 * 60 * 60 });
    const renewed = verifySessionToken(newToken)!;
    expect(renewed.expiresAt).toBe(Date.now() + 2 * HOUR);
    expect(renewed.startedAt).toBe(T0);
    expect(options.maxAge * 1000).toBe(renewed.expiresAt - Date.now());
  });

  it('requireAuthSession does not rewrite the cookie before 1h', async () => {
    vi.setSystemTime(T0 + HOUR - 1000);

    await requireAuthSession();

    expect(store.set).not.toHaveBeenCalled();
  });

  it('getCurrentSession does not renew', async () => {
    vi.setSystemTime(T0 + HOUR + 1000);

    await getCurrentSession();

    expect(store.set).not.toHaveBeenCalled();
  });

  it('GET /api/auth/me does not renew', async () => {
    vi.setSystemTime(T0 + HOUR + 1000);

    const res = await me();

    expect(res.status).toBe(200);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('a failure to write the cookie outside a Route Handler does not break the request', async () => {
    vi.setSystemTime(T0 + HOUR + 1000);
    store.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    });

    await expect(requireAuthSession()).resolves.toMatchObject({ username: 'tatiane' });
  });

  it('rejects an expired token', async () => {
    vi.setSystemTime(T0 + 2 * HOUR + 1000);

    await expect(requireAuthSession()).rejects.toThrow();
    expect(store.set).not.toHaveBeenCalled();
    expect(getSessionCookieName()).toBeTruthy();
  });
});
