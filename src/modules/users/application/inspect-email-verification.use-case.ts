import { InvalidOrExpiredLinkError } from '../domain/errors';
import { OwnerEmailRepository } from '../domain/owner-email-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { hashToken } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { assertRecoveryAllowed } from './recovery-decision';

export interface InspectEmailVerificationDeps {
  limiter: RecoveryRequestLimiter;
  owners: OwnerEmailRepository;
  tokens: RecoveryTokenRepository;
}

/** Opening the link only reads it: nothing is used or changed (AC-3). */
export class InspectEmailVerificationUseCase {
  constructor(private readonly deps: InspectEmailVerificationDeps) {}

  public async execute(input: { ip: string; token: string; now: Date }): Promise<{ email: string }> {
    assertRecoveryAllowed(await this.deps.limiter.reserveTokenAttempt(input.ip, input.now));

    const record = await this.deps.tokens.find(hashToken(input.token), input.now);
    if (!record || record.purpose !== 'EMAIL_VERIFICATION') throw new InvalidOrExpiredLinkError();
    const owner = await this.deps.owners.getEmail(record.username);
    if (!owner || owner.email !== record.email) throw new InvalidOrExpiredLinkError();
    return { email: record.email };
  }
}
