export const RECOVERY_WINDOW_MINUTES = 60;
export const RECOVERY_MAX_PER_ACCOUNT = 3;
export const RECOVERY_MAX_PER_IP = 10;
export const RECOVERY_MAX_PER_TARGET_EMAIL = 3;
export const RECOVERY_MAX_PER_DAY = 250;
export const RECOVERY_RESEND_SECONDS = 60;
export const RECOVERY_MAX_TOKEN_ATTEMPTS_PER_IP = 10;

export interface RecoveryCounts {
  /** Allowed requests of the account (any purpose), with their times. */
  accountRequests: Date[];
  /** Allowed requests of the IP, with their times. */
  ipRequests: Date[];
  /** Allowed requests that sent a link to the same destination e-mail, from any account or IP. */
  targetRequests: Date[];
  /** Allowed requests of the whole app in the last 24 h. */
  dailyCount: number;
}

export type RecoveryDecision =
  | { status: 'ALLOWED' }
  | { status: 'TOO_SOON' | 'ACCOUNT_LIMITED' | 'IP_LIMITED' | 'EMAIL_LIMITED'; retryAfterSeconds: number }
  | { status: 'DAILY_LIMITED' };

const WINDOW_MS = RECOVERY_WINDOW_MINUTES * 60 * 1000;

function inWindow(times: Date[], now: Date): number[] {
  return times
    .map((t) => t.getTime())
    .filter((t) => t > now.getTime() - WINDOW_MS)
    .sort((a, b) => a - b);
}

/** Seconds until a slot opens, or null when there is room. */
function waitForSlot(times: number[], limit: number, now: Date): number | null {
  if (times.length < limit) return null;
  return Math.ceil((times[times.length - limit] + WINDOW_MS - now.getTime()) / 1000);
}

/**
 * The rule of the recovery limits. The database only makes the count atomic (same role as
 * owner-pin-lockout.ts for ADR-013). A denied request is never counted, so spam does not extend the wait.
 * The 60 s between two requests (TOO_SOON) is only enforced when asked: the logged-in screen shows it (AC-10).
 */
export function decideRecoveryRequest(counts: RecoveryCounts, now: Date, enforceResend = false): RecoveryDecision {
  const account = inWindow(counts.accountRequests, now);
  const ip = inWindow(counts.ipRequests, now);
  const target = inWindow(counts.targetRequests, now);

  const ipWait = waitForSlot(ip, RECOVERY_MAX_PER_IP, now);
  if (ipWait !== null) return { status: 'IP_LIMITED', retryAfterSeconds: ipWait };
  if (counts.dailyCount >= RECOVERY_MAX_PER_DAY) return { status: 'DAILY_LIMITED' };
  const accountWait = waitForSlot(account, RECOVERY_MAX_PER_ACCOUNT, now);
  if (accountWait !== null) return { status: 'ACCOUNT_LIMITED', retryAfterSeconds: accountWait };
  const targetWait = waitForSlot(target, RECOVERY_MAX_PER_TARGET_EMAIL, now);
  if (targetWait !== null) return { status: 'EMAIL_LIMITED', retryAfterSeconds: targetWait };
  if (enforceResend && account.length > 0) {
    const resendWait = Math.ceil((account[account.length - 1] + RECOVERY_RESEND_SECONDS * 1000 - now.getTime()) / 1000);
    if (resendWait > 0) return { status: 'TOO_SOON', retryAfterSeconds: resendWait };
  }
  return { status: 'ALLOWED' };
}

/** Attempts to open or confirm a link, counted per IP before the token is looked up (AC-41). */
export function decideTokenAttempt(attempts: Date[], now: Date): RecoveryDecision {
  const wait = waitForSlot(inWindow(attempts, now), RECOVERY_MAX_TOKEN_ATTEMPTS_PER_IP, now);
  return wait === null ? { status: 'ALLOWED' } : { status: 'IP_LIMITED', retryAfterSeconds: wait };
}
