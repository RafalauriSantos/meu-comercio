import { and, eq, gt, isNotNull, isNull, ne } from 'drizzle-orm';
import { appUsers, ownerRecoveryTokens } from './users.schema';
import { RecoveryDatabase } from './recovery-database';
import { EmailInUseError } from '../domain/errors';
import { OwnerEmailRecord, OwnerEmailRepository } from '../domain/owner-email-repository.port';

// Drizzle wraps the driver error: the SQLSTATE can be on the error or on its cause.
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export class DrizzleOwnerEmailRepository<TSchema extends Record<string, unknown>> implements OwnerEmailRepository {
  constructor(private readonly database: RecoveryDatabase<TSchema>) {}

  async getEmail(username: string): Promise<OwnerEmailRecord | null> {
    const [row] = await this.database
      .select({ merchantId: appUsers.merchantId, email: appUsers.email, verifiedAt: appUsers.emailVerifiedAt })
      .from(appUsers)
      .where(eq(appUsers.username, username))
      .limit(1);
    return row ?? null;
  }

  async isVerifiedByAnother(email: string, username: string): Promise<boolean> {
    const [row] = await this.database
      .select({ username: appUsers.username })
      .from(appUsers)
      .where(and(eq(appUsers.email, email), isNotNull(appUsers.emailVerifiedAt), ne(appUsers.username, username)))
      .limit(1);
    return Boolean(row);
  }

  async setUnverifiedEmail(username: string, email: string): Promise<void> {
    try {
      await this.database.update(appUsers).set({ email, emailVerifiedAt: null }).where(eq(appUsers.username, username));
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseError(); // uq_app_users_owner_email (merchant_id, email)
      throw error;
    }
  }

  async changeEmail(username: string, email: string): Promise<{ previousEmail: string | null; previousVerified: boolean }> {
    try {
      return await this.database.transaction(async (tx) => {
        const [previous] = await tx
          .select({ email: appUsers.email, verifiedAt: appUsers.emailVerifiedAt })
          .from(appUsers)
          .where(eq(appUsers.username, username))
          .limit(1)
          .for('update');
        await tx.update(appUsers).set({ email, emailVerifiedAt: null }).where(eq(appUsers.username, username));
        return { previousEmail: previous?.email ?? null, previousVerified: Boolean(previous?.verifiedAt) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseError(); // uq_app_users_owner_email (merchant_id, email)
      throw error;
    }
  }

  /**
   * One transaction for "use the link" and "mark verified", so a link is not burned when the e-mail turns out
   * to be in use by another shop (the partial unique index raises 23505 and the transaction rolls back). The
   * UPDATE of the link is the atomic single use: a second concurrent confirmation waits for the first one and
   * then finds the link already used.
   */
  async confirmVerification(
    tokenHash: string,
    now: Date
  ): Promise<{ merchantId: string; username: string; email: string } | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const [link] = await tx
          .update(ownerRecoveryTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(ownerRecoveryTokens.tokenHash, tokenHash),
              eq(ownerRecoveryTokens.purpose, 'EMAIL_VERIFICATION'),
              isNull(ownerRecoveryTokens.usedAt),
              gt(ownerRecoveryTokens.expiresAt, now)
            )
          )
          .returning({ merchantId: ownerRecoveryTokens.merchantId, username: ownerRecoveryTokens.username, email: ownerRecoveryTokens.email });
        if (!link?.email) return null;

        // Only while the account still has the e-mail the link was issued for (AC-7).
        const verified = await tx
          .update(appUsers)
          .set({ emailVerifiedAt: now })
          .where(and(eq(appUsers.username, link.username), eq(appUsers.email, link.email)))
          .returning({ username: appUsers.username });
        if (verified.length === 0) return null;

        return { merchantId: link.merchantId, username: link.username, email: link.email };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailInUseError();
      throw error;
    }
  }
}
