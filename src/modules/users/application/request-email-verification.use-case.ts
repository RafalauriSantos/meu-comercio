import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { EmailSender } from '../domain/email-sender.port';
import { EmailAlreadyVerifiedError, EmailInUseError, InvalidCurrentPasswordError, InvalidEmailError } from '../domain/errors';
import { isValidEmail, normalizeEmail } from '../domain/owner-email';
import { OwnerEmailRepository } from '../domain/owner-email-repository.port';
import { verifySecret } from '../domain/password';
import { UserRepository } from '../domain/user-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { assertRecoveryAllowed } from './recovery-decision';
import { sendVerificationLink } from './send-verification-link';

export interface RequestEmailVerificationDeps {
  limiter: RecoveryRequestLimiter;
  owners: OwnerEmailRepository;
  tokens: RecoveryTokenRepository;
  sender: EmailSender;
  audit: AuditPort;
  users: UserRepository;
  baseUrl: string | undefined;
}

export interface RequestEmailVerificationInput {
  merchantId: string;
  username: string;
  ip: string;
  /** Omitted on a resend: the e-mail already on the account is used. */
  email?: string;
  /** Required when the e-mail is not the one already on the account. */
  currentPassword?: string;
  now: Date;
}

/** The owner registers an e-mail (or asks for the link again). The limit is counted before anything is saved or sent. A new e-mail asks for the current password. */
export class RequestEmailVerificationUseCase {
  constructor(private readonly deps: RequestEmailVerificationDeps) {}

  public async execute(input: RequestEmailVerificationInput): Promise<{ email: string }> {
    const { owners, limiter, users } = this.deps;
    const { merchantId, username, ip, currentPassword, now } = input;

    const current = await owners.getEmail(username);
    const email = normalizeEmail(input.email ?? current?.email ?? '');
    if (!current || !isValidEmail(email)) throw new InvalidEmailError();
    if (current.verifiedAt) throw new EmailAlreadyVerifiedError();

    assertRecoveryAllowed(await limiter.reserve({ accountKey: username, ipKey: ip, targetKey: email, enforceResend: true }, now));

    if (email !== current.email) {
      const user = await users.findByUsername(username);
      if (!user || !currentPassword || !(await verifySecret(currentPassword, user.passwordHash))) {
        throw new InvalidCurrentPasswordError();
      }
    }

    if (await owners.isVerifiedByAnother(email, username)) throw new EmailInUseError();
    await owners.setUnverifiedEmail(username, email);
    await sendVerificationLink(this.deps, { merchantId, username, email, now });
    return { email };
  }
}
