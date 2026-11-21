import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionToken, isSessionRevoked, renewSessionToken, verifySessionToken } from './session';

describe('Session Token Management', () => {
  it('should generate and verify a valid session token', () => {
    const token = createSessionToken({
      username: 'tatiane',
      merchantId: 'merchant-123',
      authorities: ['ROLE_OWNER', 'CREATE_SALE'],
    });

    const session = verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.username).toBe('tatiane');
    expect(session?.merchantId).toBe('merchant-123');
    expect(session?.authorities).toContain('ROLE_OWNER');
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should reject tampered tokens', () => {
    const token = createSessionToken({
      username: 'tatiane',
      merchantId: 'merchant-123',
      authorities: ['ROLE_OWNER'],
    });

    const [, sig] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        username: 'hacker',
        merchantId: 'merchant-123',
        authorities: ['ROLE_OWNER'],
        expiresAt: Date.now() + 100000,
      })
    ).toString('base64url');

    const tamperedToken = `${tamperedPayload}.${sig}`;
    expect(verifySessionToken(tamperedToken)).toBeNull();
  });

  it('should reject expired tokens', () => {
    // 0 minutes timeout -> expires immediately
    const token = createSessionToken(
      {
        username: 'tatiane',
        merchantId: 'merchant-123',
        authorities: ['ROLE_OWNER'],
      },
      -1 // expired 1 minute ago
    );

    expect(verifySessionToken(token)).toBeNull();
  });
});

describe('Sliding session', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const T0 = new Date('2026-11-16T08:00:00Z').getTime();
  const SECRET = 'test-session-secret-with-at-least-32-chars';
  const user = { username: 'tatiane', merchantId: 'merchant-123', authorities: ['ROLE_OWNER' as const] };

  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function signRaw(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
  }

  it('new token has startedAt and expires in 2 hours', () => {
    const session = verifySessionToken(createSessionToken(user));
    expect(session?.startedAt).toBe(T0);
    expect(session?.expiresAt).toBe(T0 + 2 * HOUR);
  });

  it('renews after more than 1h since the last renewal, to now + 2h', () => {
    const session = verifySessionToken(createSessionToken(user))!;
    vi.setSystemTime(T0 + HOUR + 1000);

    const renewed = renewSessionToken(session)!;

    const next = verifySessionToken(renewed.token)!;
    expect(next.startedAt).toBe(T0);
    expect(next.expiresAt).toBe(T0 + HOUR + 1000 + 2 * HOUR);
    expect(next.username).toBe('tatiane');
    expect(renewed.maxAgeSeconds).toBe(2 * 60 * 60);
  });

  it('does not renew before 1h since the last renewal', () => {
    const session = verifySessionToken(createSessionToken(user))!;
    vi.setSystemTime(T0 + HOUR - 1000);

    expect(renewSessionToken(session)).toBeNull();
  });

  it('never extends past startedAt + 12h and the cookie age follows the same cap', () => {
    let session = verifySessionToken(createSessionToken(user))!;
    // use every 90 minutes until close to the cap
    for (let t = 90; t <= 600; t += 90) {
      vi.setSystemTime(T0 + t * MIN);
      const renewed = renewSessionToken(session);
      expect(renewed).not.toBeNull();
      session = verifySessionToken(renewed!.token)!;
      expect(session.expiresAt).toBeLessThanOrEqual(T0 + 12 * HOUR);
    }
    vi.setSystemTime(T0 + 11 * HOUR);
    const last = renewSessionToken(session)!;
    expect(verifySessionToken(last.token)!.expiresAt).toBe(T0 + 12 * HOUR);
    expect(last.maxAgeSeconds).toBe(60 * 60);
  });

  it('expires at the 12h cap even with constant use', () => {
    let session = verifySessionToken(createSessionToken(user))!;
    let token = createSessionToken(user);
    for (let t = 90; t < 12 * 60; t += 90) {
      vi.setSystemTime(T0 + t * MIN);
      const renewed = renewSessionToken(session);
      if (renewed) {
        token = renewed.token;
        session = verifySessionToken(token)!;
      }
    }
    vi.setSystemTime(T0 + 12 * HOUR + 1000);
    expect(verifySessionToken(token)).toBeNull();
    expect(renewSessionToken(session)).toBeNull();
  });

  it('legacy token without startedAt stays valid until its expiry and is never renewed', () => {
    const legacyData = { ...user, expiresAt: T0 + 30 * MIN };
    const token = signRaw(legacyData);

    vi.setSystemTime(T0 + 20 * MIN);
    const session = verifySessionToken(token);
    expect(session?.username).toBe('tatiane');
    expect(renewSessionToken(session!)).toBeNull();

    vi.setSystemTime(T0 + 31 * MIN);
    expect(verifySessionToken(token)).toBeNull();
  });
});

describe('isSessionRevoked (D-32, AC-52, AC-55)', () => {
  const base = { username: 'dona', merchantId: 'm', authorities: ['ROLE_OWNER' as const], expiresAt: Date.now() + 60_000 };
  const changedAt = new Date('2026-11-21T12:00:00Z');

  it('sem troca de senha registrada, nada é revogado', () => {
    expect(isSessionRevoked({ ...base, startedAt: 1 }, null)).toBe(false);
  });

  it('sessão iniciada antes da troca é revogada; depois, vale', () => {
    expect(isSessionRevoked({ ...base, startedAt: changedAt.getTime() - 1 }, changedAt)).toBe(true);
    expect(isSessionRevoked({ ...base, startedAt: changedAt.getTime() }, changedAt)).toBe(true); // same millisecond: revoked
    expect(isSessionRevoked({ ...base, startedAt: changedAt.getTime() + 1 }, changedAt)).toBe(false);
  });

  it('cookie sem startedAt conta como anterior à troca', () => {
    expect(isSessionRevoked(base, changedAt)).toBe(true);
  });
});
