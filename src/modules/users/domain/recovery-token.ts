import { createHash, randomBytes } from 'node:crypto';

export type RecoveryPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'PIN_RESET';

export const RECOVERY_TOKEN_TTL_MINUTES = 30;

/** 32 random bytes (256 bits). Only its hash is stored. */
export function generateRecoveryToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A token is valid while `expiresAt` is after `now`: at exactly 30:00 it is refused. */
export function recoveryTokenExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
}
