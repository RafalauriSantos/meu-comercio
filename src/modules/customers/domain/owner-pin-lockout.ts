import { OwnerPinAttemptState } from './owner-pin-attempt.port';

export const OWNER_PIN_MAX_FAILURES = 5;
export const OWNER_PIN_LOCK_MINUTES = 15;

export const NO_OWNER_PIN_ATTEMPTS: OwnerPinAttemptState = { failedCount: 0, lockedUntil: null };

export function isOwnerPinLocked(state: OwnerPinAttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * Counts one attempt before the PIN is compared. A locked merchant is refused
 * without counting. The attempt that reaches the limit is allowed, and it starts the lock.
 */
export function reserveOwnerPinAttempt(
  state: OwnerPinAttemptState,
  now: Date
): { allowed: boolean; next: OwnerPinAttemptState } {
  if (isOwnerPinLocked(state, now)) {
    return { allowed: false, next: state };
  }
  const failedCount = state.failedCount + 1;
  const lockedUntil =
    failedCount >= OWNER_PIN_MAX_FAILURES
      ? new Date(now.getTime() + OWNER_PIN_LOCK_MINUTES * 60 * 1000)
      : null;
  return { allowed: true, next: { failedCount, lockedUntil } };
}
