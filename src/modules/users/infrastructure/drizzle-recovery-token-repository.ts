import { and, eq, gt, isNull } from 'drizzle-orm';
import { ownerRecoveryTokens } from './users.schema';
import { RecoveryDatabase } from './recovery-database';
import { RecoveryPurpose } from '../domain/recovery-token';
import {
  IssueRecoveryTokenParams,
  RecoveryTokenRecord,
  RecoveryTokenRepository,
} from '../domain/recovery-token-repository.port';

export class DrizzleRecoveryTokenRepository<TSchema extends Record<string, unknown>> implements RecoveryTokenRepository {
  constructor(private readonly database: RecoveryDatabase<TSchema>) {}

  async issue(params: IssueRecoveryTokenParams): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx
        .update(ownerRecoveryTokens)
        .set({ expiresAt: params.now })
        .where(
          and(
            eq(ownerRecoveryTokens.username, params.username),
            eq(ownerRecoveryTokens.purpose, params.purpose),
            isNull(ownerRecoveryTokens.usedAt),
            gt(ownerRecoveryTokens.expiresAt, params.now)
          )
        );
      await tx.insert(ownerRecoveryTokens).values({
        merchantId: params.merchantId,
        username: params.username,
        tokenHash: params.tokenHash,
        purpose: params.purpose,
        email: params.email,
        expiresAt: params.expiresAt,
        createdAt: params.now,
      });
    });
  }

  async find(tokenHash: string, now: Date): Promise<RecoveryTokenRecord | null> {
    const [row] = await this.database
      .select({
        merchantId: ownerRecoveryTokens.merchantId,
        username: ownerRecoveryTokens.username,
        purpose: ownerRecoveryTokens.purpose,
        email: ownerRecoveryTokens.email,
      })
      .from(ownerRecoveryTokens)
      .where(
        and(
          eq(ownerRecoveryTokens.tokenHash, tokenHash),
          isNull(ownerRecoveryTokens.usedAt),
          gt(ownerRecoveryTokens.expiresAt, now)
        )
      )
      .limit(1);
    if (!row || !row.purpose || !row.email) return null;
    return { merchantId: row.merchantId, username: row.username, purpose: row.purpose as RecoveryPurpose, email: row.email };
  }

  async invalidate(tokenHash: string, now: Date): Promise<void> {
    await this.database
      .update(ownerRecoveryTokens)
      .set({ expiresAt: now })
      .where(
        and(eq(ownerRecoveryTokens.tokenHash, tokenHash), isNull(ownerRecoveryTokens.usedAt), gt(ownerRecoveryTokens.expiresAt, now))
      );
  }
}
