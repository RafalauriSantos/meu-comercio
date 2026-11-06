import { OwnerPinAttemptState } from './owner-pin-attempt.port';

export const OWNER_PIN_MAX_FAILURES = 5;
export const OWNER_PIN_LOCK_MINUTES = 15;

export const NO_OWNER_PIN_ATTEMPTS: OwnerPinAttemptState = { failedCount: 0, lockedUntil: null };

export function isOwnerPinLocked(state: OwnerPinAttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function afterOwnerPinFailure(state: OwnerPinAttemptState, now: Date): OwnerPinAttemptState {
  const failedCount = state.failedCount + 1;
  const lockedUntil =
    failedCount >= OWNER_PIN_MAX_FAILURES
      ? new Date(now.getTime() + OWNER_PIN_LOCK_MINUTES * 60 * 1000)
      : null;
  return { failedCount, lockedUntil };
}

export function afterOwnerPinSuccess(): OwnerPinAttemptState {
  return NO_OWNER_PIN_ATTEMPTS;
}
