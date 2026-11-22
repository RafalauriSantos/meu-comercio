import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailSender } from '../domain/email-sender.port';
import { EmailInUseError, InvalidCurrentPasswordError, InvalidEmailError } from '../domain/errors';
import { isValidEmail, maskEmail, normalizeEmail } from '../domain/owner-email';
import { OwnerEmailRepository } from '../domain/owner-email-repository.port';
import { verifySecret } from '../domain/password';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { UserRepository } from '../domain/user-repository.port';
import { assertRecoveryAllowed } from './recovery-decision';
import { emailChangedNotice } from './recovery-email-templates';
import { sendRecoveryLink } from './send-recovery-link';

export interface ChangeOwnerEmailDeps {
  limiter: RecoveryRequestLimiter;
  owners: OwnerEmailRepository;
  tokens: RecoveryTokenRepository;
  sender: EmailSender;
  audit: AuditPort;
  users: UserRepository;
  baseUrl: string | undefined;
  /** Receives errors that must not fail the request (the notice to the old e-mail). */
  reportError: (error: unknown) => void;
}

export interface ChangeOwnerEmailInput {
  merchantId: string;
  username: string;
  ip: string;
  email: string;
  currentPassword: string;
  now: Date;
}

/**
 * Changes the recovery e-mail. It asks for the current password, and the limit is counted BEFORE the password
 * is checked, so a stolen session cannot guess the password here without limit.
 */
export class ChangeOwnerEmailUseCase {
  constructor(private readonly deps: ChangeOwnerEmailDeps) {}

  public async execute(input: ChangeOwnerEmailInput): Promise<{ email: string }> {
    const { limiter, owners, users, audit, sender } = this.deps;
    const { merchantId, username, ip, currentPassword, now } = input;

    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new InvalidEmailError();

    // Same e-mail as now: nothing to change, and the verification must not be lost.
    if ((await owners.getEmail(username))?.email === email) return { email };

    assertRecoveryAllowed(await limiter.reserve({ accountKey: username, ipKey: ip, targetKey: email, enforceResend: true }, now));

    const user = await users.findByUsername(username);
    if (!user || !(await verifySecret(currentPassword, user.passwordHash))) throw new InvalidCurrentPasswordError();
    if (await owners.isVerifiedByAnother(email, username)) throw new EmailInUseError();

    const previous = await owners.changeEmail(username, email);
    await audit.record(merchantId, 'OWNER_EMAIL_CHANGED', username, 'MERCHANT', merchantId, { email: maskEmail(email) });

    // The change is saved. A failed notice must not undo it, and must not stop the new link.
    if (previous.previousEmail && previous.previousVerified) {
      try {
        await sender.send({ to: previous.previousEmail, ...emailChangedNotice(maskEmail(email), now) });
      } catch (error) {
        this.deps.reportError(error);
      }
    }

    await sendRecoveryLink(this.deps, 'EMAIL_VERIFICATION', { merchantId, username, email, now });
    return { email };
  }
}
