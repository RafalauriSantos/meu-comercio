import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailSender } from '../domain/email-sender.port';
import { InvalidNewPasswordError, InvalidOrExpiredLinkError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { hashSecret, verifySecret } from '../domain/password';
import { PasswordResetRepository } from '../domain/password-reset-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { hashToken } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { validateNewPassword } from './new-credentials';
import { safeToReport } from './safe-report';
import { assertRecoveryAllowed } from './recovery-decision';
import { passwordChangedNotice } from './recovery-email-templates';

export interface ResetPasswordDeps {
  limiter: RecoveryRequestLimiter;
  resets: PasswordResetRepository;
  tokens: RecoveryTokenRepository;
  audit: AuditPort;
  sender: EmailSender;
  /** Runs the task after the response (`after()` in the route). */
  defer: (task: () => Promise<void>) => void;
  reportError: (error: unknown) => void;
}

/**
 * Only the POST uses the link. Needs no session. A refused password never uses the link (AC-20). The link, the
 * hash and the login counters change in one transaction; what comes after cannot undo the new password.
 */
export class ResetPasswordUseCase {
  constructor(private readonly deps: ResetPasswordDeps) {}

  public async execute(input: { ip: string; token: string; password: string; confirmPassword: string; now: Date }): Promise<void> {
    const { limiter, resets, tokens, audit, sender, defer, reportError } = this.deps;
    const { password, now } = input;
    // Form errors come first: they say nothing about the link and do not use up the IP's attempts.
    validateNewPassword(password, input.confirmPassword);

    assertRecoveryAllowed(await limiter.reserveTokenAttempt(input.ip, now));

    const tokenHash = hashToken(input.token);
    const link = await tokens.find(tokenHash, now);
    if (!link || link.purpose !== 'PASSWORD_RESET') throw new InvalidOrExpiredLinkError();
    const current = await resets.getCredentials(link.username);
    if (!current?.verifiedAt || current.email !== link.email) throw new InvalidOrExpiredLinkError();
    if (await verifySecret(password, current.passwordHash)) {
      throw new InvalidNewPasswordError('A nova senha deve ser diferente da atual.');
    }

    // bcrypt is slow: outside the transaction, so no lock is held meanwhile.
    const done = await resets.resetPassword({ tokenHash, passwordHash: await hashSecret(password), now });
    if (!done) throw new InvalidOrExpiredLinkError();

    const { merchantId, username, email } = done;
    try {
      await audit.record(merchantId, 'PASSWORD_RESET_COMPLETED', username, 'MERCHANT', merchantId, {
        purpose: 'PASSWORD_RESET', email: maskEmail(email),
      });
    } catch (error) {
      reportError(safeToReport(error));
    }
    defer(async () => {
      try {
        await sender.send({ to: email, ...passwordChangedNotice(now) });
      } catch (error) {
        reportError(safeToReport(error));
      }
    });
  }
}
