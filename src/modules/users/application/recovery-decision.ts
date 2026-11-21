import { EmailDeliveryError } from '../domain/email-sender.port';
import { EmailSendFailedError, RecoveryRateLimitedError } from '../domain/errors';
import { RecoveryDecision } from '../domain/recovery-limits';

/**
 * Turns a refused limit decision into an error. The daily cap is not the fault of the person asking: it is
 * reported as a send failure (kind daily_limit), which also reaches Sentry with a fixed text and no personal
 * data (AC-42).
 */
export function assertRecoveryAllowed(decision: RecoveryDecision): void {
  if (decision.status === 'ALLOWED') return;
  if (decision.status === 'DAILY_LIMITED') throw new EmailSendFailedError(new EmailDeliveryError('daily_limit'));
  throw new RecoveryRateLimitedError(decision.retryAfterSeconds);
}
