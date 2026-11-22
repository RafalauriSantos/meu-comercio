import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailSender } from '../domain/email-sender.port';
import { InvalidNewPasswordError, InvalidOrExpiredLinkError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { OwnerPinLockReset } from '../domain/owner-pin-lock-reset.port';
import { hashSecret, verifySecret } from '../domain/password';
import { PasswordResetRepository } from '../domain/password-reset-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { hashToken } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { validateNewPassword, validateNewPin } from './new-credentials';
import { assertRecoveryAllowed } from './recovery-decision';
import { pinChangedNotice } from './recovery-email-templates';
import { safeToReport } from './safe-report';

export interface ResetPinDeps {
  limiter: RecoveryRequestLimiter;
  resets: PasswordResetRepository;
  tokens: RecoveryTokenRepository;
  audit: AuditPort;
  sender: EmailSender;
  /** Clears the store's PIN lock after the new PIN is saved (ADR-025). */
  pinLock: OwnerPinLockReset;
  /** Runs the task after the response (`after()` in the route). */
  defer: (task: () => Promise<void>) => void;
  reportError: (error: unknown) => void;
}

/**
 * Only the POST uses the link, and it always changes the password and the PIN together (AC-28, AC-29). A refused
 * field never uses the link (AC-30). Link, both hashes and the login counters change in one transaction; the PIN
 * lock of the store is cleared after it, and what comes after cannot undo the new credentials (ADR-025).
 */
export class ResetPinUseCase {
  constructor(private readonly deps: ResetPinDeps) {}

  public async execute(input: {
    ip: string;
    token: string;
    password: string;
    confirmPassword: string;
    pin: string;
    confirmPin: string;
    now: Date;
  }): Promise<void> {
    const { limiter, resets, tokens, audit, sender, pinLock, defer, reportError } = this.deps;
    const { password, pin, now } = input;
    // Form errors come first: they say nothing about the link and do not use up the IP's attempts.
    validateNewPassword(password, input.confirmPassword);
    validateNewPin(pin, input.confirmPin);

    assertRecoveryAllowed(await limiter.reserveTokenAttempt(input.ip, now));

    const tokenHash = hashToken(input.token);
    const link = await tokens.find(tokenHash, now);
    if (!link || link.purpose !== 'PIN_RESET') throw new InvalidOrExpiredLinkError();
    const current = await resets.getCredentials(link.username);
    if (!current?.verifiedAt || current.email !== link.email) throw new InvalidOrExpiredLinkError();
    if (await verifySecret(password, current.passwordHash)) {
      throw new InvalidNewPasswordError('A nova senha deve ser diferente da atual.');
    }

    // bcrypt is slow: outside the transaction, so no lock is held meanwhile.
    const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);
    const done = await resets.resetPasswordAndPin({ tokenHash, passwordHash, pinHash, now });
    if (!done) throw new InvalidOrExpiredLinkError();

    const { merchantId, username, email } = done;
    try {
      // The old PIN no longer exists, so its lock has nothing left to protect. If this fails the lock stays (safe side).
      await pinLock.clear(merchantId);
    } catch (error) {
      reportError(safeToReport(error));
    }
    try {
      await audit.record(merchantId, 'OWNER_PIN_RESET_COMPLETED', username, 'MERCHANT', merchantId, {
        purpose: 'PIN_RESET', email: maskEmail(email),
      });
    } catch (error) {
      reportError(safeToReport(error));
    }
    defer(async () => {
      try {
        await sender.send({ to: email, ...pinChangedNotice(now) });
      } catch (error) {
        reportError(safeToReport(error));
      }
    });
  }
}
