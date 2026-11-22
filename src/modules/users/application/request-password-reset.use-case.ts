import { EmailDeliveryError } from '../domain/email-sender.port';
import { InvalidEmailError, RecoveryRateLimitedError } from '../domain/errors';
import { isValidEmail, normalizeEmail } from '../domain/owner-email';
import { PasswordResetRepository } from '../domain/password-reset-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { safeToReport } from './safe-report';
import { RecoveryLinkDeps, sendRecoveryLink } from './send-recovery-link';

// Account-key prefix of the limiter for an e-mail with no account, per purpose.
const UNKNOWN_ACCOUNT_PREFIX = { PASSWORD_RESET: 'pwd-reset', PIN_RESET: 'pin-reset' };

export interface RequestPasswordResetDeps extends RecoveryLinkDeps {
  /** Which recovery this request starts. Defaults to the password reset. */
  purpose?: keyof typeof UNKNOWN_ACCOUNT_PREFIX;
  limiter: RecoveryRequestLimiter;
  resets: PasswordResetRepository;
  /** Runs the task after the response (`after()` in the route). Nobody waits for it, so it never throws. */
  defer: (task: () => Promise<void>) => void;
  reportError: (error: unknown) => void;
}

/**
 * Public "forgot my password". The synchronous path is the same for every e-mail (AC-13, AC-15): one lookup, one
 * limit reservation, then the caller answers. Everything that tells "exists" apart (the link, the audit, the
 * send to Brevo) runs in the deferred task.
 */
export class RequestPasswordResetUseCase {
  constructor(private readonly deps: RequestPasswordResetDeps) {}

  public async execute(input: { email: string; ip: string; now: Date }): Promise<void> {
    const { limiter, resets, defer, reportError, purpose = 'PASSWORD_RESET' } = this.deps;
    const { ip, now } = input;
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new InvalidEmailError();

    const owner = await resets.findOwnerByVerifiedEmail(email);
    const decision = await limiter.reserve(
      { accountKey: owner?.username ?? `${UNKNOWN_ACCOUNT_PREFIX[purpose]}:${email}`, ipKey: ip, targetKey: email, enforceResend: true },
      now
    );
    if (decision.status === 'IP_LIMITED') throw new RecoveryRateLimitedError(decision.retryAfterSeconds);
    if (decision.status === 'DAILY_LIMITED') reportError(new EmailDeliveryError('daily_limit'));

    defer(async () => {
      if (!owner || decision.status !== 'ALLOWED') return;
      try {
        await sendRecoveryLink(this.deps, purpose, { ...owner, email, now });
      } catch (error) {
        reportError(safeToReport(error));
      }
    });
  }
}
