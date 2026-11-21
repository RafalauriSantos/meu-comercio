import { describe, it, expect } from 'vitest';
import { generateRecoveryToken, hashToken, recoveryTokenExpiresAt, RECOVERY_TOKEN_TTL_MINUTES } from './recovery-token';

describe('recovery-token', () => {
  it('gera token com pelo menos 128 bits, em base64url, diferente a cada chamada', () => {
    const a = generateRecoveryToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateRecoveryToken()).not.toBe(a);
  });

  it('o hash é SHA-256 em hexadecimal (64 caracteres) e não contém o token', () => {
    const token = generateRecoveryToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });

  it('vale 30 minutos a partir do pedido', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    expect(RECOVERY_TOKEN_TTL_MINUTES).toBe(30);
    expect(recoveryTokenExpiresAt(now).toISOString()).toBe('2026-11-21T12:30:00.000Z');
  });
});
