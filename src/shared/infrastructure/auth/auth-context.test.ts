import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock('next/headers', () => ({ cookies: async () => store }));
const getCredentialsChangedAt = vi.fn();
vi.mock('@/modules/users/infrastructure/drizzle-credentials-version', () => ({
  getCredentialsChangedAt: (username: string) => getCredentialsChangedAt(username),
}));

import crypto from 'crypto';
import { clearSessionCookie, getCurrentSession, requireAuthSession, setSessionCookie, UnauthorizedError } from './auth-context';
import { createSessionToken, getSessionCookieName } from './session';

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

describe('getCurrentSession: sessão da dona revogada pela troca de senha (D-32, ADR-024)', () => {
  const changedAt = new Date('2026-11-21T12:00:00Z');
  const owner = { username: 'dona', merchantId: 'm1', authorities: ['ROLE_OWNER' as const] };
  const operator = { username: 'caixa', merchantId: 'm1', authorities: ['ROLE_OPERATOR' as const, 'CREATE_SALE' as const] };

  // Signs a cookie as if the login happened at `startedAt`, and moves the clock one minute after it.
  function cookieStartedAt(data: typeof owner | typeof operator, startedAt: number) {
    vi.useFakeTimers({ now: startedAt });
    store.get.mockReturnValue({ value: createSessionToken(data) });
    vi.setSystemTime(startedAt + 60_000);
  }

  beforeEach(() => {
    store.get.mockReset();
    getCredentialsChangedAt.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-52: cookie emitido antes da troca vira null e requireAuthSession responde 401', async () => {
    getCredentialsChangedAt.mockResolvedValue(changedAt);
    cookieStartedAt(owner, changedAt.getTime() - 3600_000);

    expect(await getCurrentSession()).toBeNull();
    await expect(requireAuthSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('AC-52: cookie sem startedAt conta como anterior à troca', async () => {
    getCredentialsChangedAt.mockResolvedValue(changedAt);
    const payload = Buffer.from(JSON.stringify({ ...owner, expiresAt: Date.now() + 60_000 })).toString('base64url');
    const secret = 'development-session-secret-must-be-at-least-32-chars-long';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    store.get.mockReturnValue({ value: `${payload}.${signature}` });

    expect(await getCurrentSession()).toBeNull();
  });

  it('AC-55: sessão iniciada depois da troca vale', async () => {
    getCredentialsChangedAt.mockResolvedValue(changedAt);
    cookieStartedAt(owner, changedAt.getTime() + 1000);

    expect(await getCurrentSession()).toMatchObject({ username: 'dona' });
  });

  it('sem troca registrada (credentials_changed_at nulo), nada muda', async () => {
    getCredentialsChangedAt.mockResolvedValue(null);
    cookieStartedAt(owner, changedAt.getTime() - 3600_000);

    expect(await getCurrentSession()).toMatchObject({ username: 'dona' });
  });

  it('AC-54: sessão de operadora vale e a consulta nem acontece', async () => {
    getCredentialsChangedAt.mockResolvedValue(changedAt);
    cookieStartedAt(operator, changedAt.getTime() - 3600_000);

    expect(await getCurrentSession()).toMatchObject({ username: 'caixa' });
    expect(getCredentialsChangedAt).not.toHaveBeenCalled();
  });

  it('sem cookie: null e nenhuma consulta', async () => {
    store.get.mockReturnValue(undefined);

    expect(await getCurrentSession()).toBeNull();
    expect(getCredentialsChangedAt).not.toHaveBeenCalled();
  });

  it('falha do banco na consulta falha a requisição (nunca deixa passar)', async () => {
    getCredentialsChangedAt.mockRejectedValue(new Error('db down'));
    cookieStartedAt(owner, Date.now() - 1000);

    await expect(getCurrentSession()).rejects.toThrow('db down');
  });
});
