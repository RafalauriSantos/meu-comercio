import { RecoveryDecision } from './recovery-limits';

export interface RecoveryRequestLimiter {
  /**
   * Counts one request atomically, before anything is sent. A denied request is not counted.
   * With enforceResend, a second request within 60 s of the last one of the account is TOO_SOON.
   */
  reserve(keys: { accountKey: string; ipKey: string; enforceResend?: boolean }, now: Date): Promise<RecoveryDecision>;
  /** Counts one attempt to open or confirm a link, per IP. */
  reserveTokenAttempt(ipKey: string, now: Date): Promise<RecoveryDecision>;
}
