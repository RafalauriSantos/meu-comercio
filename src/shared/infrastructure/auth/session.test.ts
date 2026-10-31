import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

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

    const [payload, sig] = token.split('.');
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
