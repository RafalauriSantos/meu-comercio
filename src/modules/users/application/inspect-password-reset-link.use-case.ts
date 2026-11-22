import { InvalidOrExpiredLinkError } from '../domain/errors';
import { PasswordResetRepository } from '../domain/password-reset-repository.port';
import { RecoveryRequestLimiter } from '../domain/recovery-request-limiter.port';
import { hashToken } from '../domain/recovery-token';
import { RecoveryTokenRepository } from '../domain/recovery-token-repository.port';
import { assertRecoveryAllowed } from './recovery-decision';

export interface InspectPasswordResetLinkDeps {
  limiter: RecoveryRequestLimiter;
  resets: PasswordResetRepository;
  tokens: RecoveryTokenRepository;
  /** Which link is inspected. Defaults to the password reset. */
  purpose?: 'PASSWORD_RESET' | 'PIN_RESET';
}

/** Opening the link only checks it: nothing is used or changed (AC-18). Says nothing about the account. */
export class InspectPasswordResetLinkUseCase {
  constructor(private readonly deps: InspectPasswordResetLinkDeps) {}

  public async execute(input: { ip: string; token: string; now: Date }): Promise<void> {
    assertRecoveryAllowed(await this.deps.limiter.reserveTokenAttempt(input.ip, input.now));

    const record = await this.deps.tokens.find(hashToken(input.token), input.now);
    if (!record || record.purpose !== (this.deps.purpose ?? 'PASSWORD_RESET')) throw new InvalidOrExpiredLinkError();
    const owner = await this.deps.resets.getCredentials(record.username);
    if (!owner?.verifiedAt || owner.email !== record.email) throw new InvalidOrExpiredLinkError();
  }
}
