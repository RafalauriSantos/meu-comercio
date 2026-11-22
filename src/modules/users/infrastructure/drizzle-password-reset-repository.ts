import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { appUsers, merchants, ownerRecoveryTokens, userAuthorities } from './users.schema';
import { RecoveryDatabase } from './recovery-database';
import { OwnerCredentials, PasswordResetOwner, PasswordResetRepository } from '../domain/password-reset-repository.port';

export class DrizzlePasswordResetRepository<TSchema extends Record<string, unknown>> implements PasswordResetRepository {
  constructor(private readonly database: RecoveryDatabase<TSchema>) {}

  async findOwnerByVerifiedEmail(email: string): Promise<PasswordResetOwner | null> {
    const [row] = await this.database
      .select({ merchantId: appUsers.merchantId, username: appUsers.username, merchantName: merchants.name })
      .from(appUsers)
      .innerJoin(merchants, eq(merchants.id, appUsers.merchantId))
      .innerJoin(
        userAuthorities,
        and(eq(userAuthorities.username, appUsers.username), eq(userAuthorities.authority, 'ROLE_OWNER'))
      )
      .where(and(eq(appUsers.email, email), isNotNull(appUsers.emailVerifiedAt), eq(appUsers.enabled, true)))
      .limit(1);
    return row ?? null;
  }

  async getCredentials(username: string): Promise<OwnerCredentials | null> {
    const [row] = await this.database
      .select({ passwordHash: appUsers.passwordHash, email: appUsers.email, verifiedAt: appUsers.emailVerifiedAt })
      .from(appUsers)
      .innerJoin(userAuthorities, and(eq(userAuthorities.username, appUsers.username), eq(userAuthorities.authority, 'ROLE_OWNER')))
      .where(and(eq(appUsers.username, username), eq(appUsers.enabled, true)))
      .limit(1);
    return row ?? null;
  }

  async resetPassword(params: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<{ merchantId: string; username: string; email: string } | null> {
    return this.useLinkAndUpdate('PASSWORD_RESET', params.tokenHash, params.now, { passwordHash: params.passwordHash });
  }

  async resetPasswordAndPin(params: {
    tokenHash: string;
    passwordHash: string;
    pinHash: string;
    now: Date;
  }): Promise<{ merchantId: string; username: string; email: string } | null> {
    return this.useLinkAndUpdate('PIN_RESET', params.tokenHash, params.now, {
      passwordHash: params.passwordHash,
      authorizationPinHash: params.pinHash,
    });
  }

  /**
   * One transaction for "use the link" and "save the new credentials". The UPDATE of the link is the atomic single
   * use: a second concurrent call waits for the first one and then finds the link already used (AC-23). The password
   * is always part of the values, so nothing here can change the PIN alone (AC-28).
   */
  private async useLinkAndUpdate(
    purpose: 'PASSWORD_RESET' | 'PIN_RESET',
    tokenHash: string,
    now: Date,
    values: { passwordHash: string; authorizationPinHash?: string }
  ): Promise<{ merchantId: string; username: string; email: string } | null> {
    return this.database.transaction(async (tx) => {
      const [link] = await tx
        .update(ownerRecoveryTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(ownerRecoveryTokens.tokenHash, tokenHash),
            eq(ownerRecoveryTokens.purpose, purpose),
            isNull(ownerRecoveryTokens.usedAt),
            gt(ownerRecoveryTokens.expiresAt, now)
          )
        )
        .returning({ merchantId: ownerRecoveryTokens.merchantId, username: ownerRecoveryTokens.username, email: ownerRecoveryTokens.email });
      if (!link?.email) return null;

      // Only for an enabled owner who still has, and has confirmed, the e-mail the link was issued for. The change
      // date is taken here, after the slow hashing, so a session that began while the request ran is also ended.
      const [ownerRole] = await tx
        .select({ username: userAuthorities.username })
        .from(userAuthorities)
        .where(and(eq(userAuthorities.username, link.username), eq(userAuthorities.authority, 'ROLE_OWNER')))
        .limit(1);
      if (!ownerRole) return null;
      const updated = await tx
        .update(appUsers)
        .set({ ...values, credentialsChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
        .where(and(eq(appUsers.username, link.username), eq(appUsers.email, link.email), isNotNull(appUsers.emailVerifiedAt), eq(appUsers.enabled, true)))
        .returning({ username: appUsers.username });
      if (updated.length === 0) return null;

      return { merchantId: link.merchantId, username: link.username, email: link.email };
    });
  }
}
