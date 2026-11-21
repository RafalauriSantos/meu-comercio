import type { AuditPort } from '@/modules/audit/domain/audit.port';
import { InvalidOrExpiredLinkError } from '../domain/errors';
import { maskEmail } from '../domain/owner-email';
import { OwnerEmailRepository } from '../domain/owner-email-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { hashToken } from '../domain/recovery-token';
import { assertRecoveryAllowed } from './recovery-decision';

export interface ConfirmEmailVerificationDeps {
  limiter: RecoveryRequestLimiter;
  owners: OwnerEmailRepository;
  audit: AuditPort;
}

/** Only the POST uses the link. Needs no session: whoever holds the link confirms. */
export class ConfirmEmailVerificationUseCase {
  constructor(private readonly deps: ConfirmEmailVerificationDeps) {}

  public async execute(input: { ip: string; token: string; now: Date }): Promise<{ email: string }> {
    assertRecoveryAllowed(await this.deps.limiter.reserveTokenAttempt(input.ip, input.now));

    const confirmed = await this.deps.owners.confirmVerification(hashToken(input.token), input.now);
    if (!confirmed) throw new InvalidOrExpiredLinkError();

    const { merchantId, username, email } = confirmed;
    await this.deps.audit.record(merchantId, 'OWNER_EMAIL_VERIFIED', username, 'MERCHANT', merchantId, {
      purpose: 'EMAIL_VERIFICATION', email: maskEmail(email),
    });
    return { email };
  }
}
