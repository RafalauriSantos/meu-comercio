import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { ownerPinAttempts } from './customers.schema';
import { OwnerPinAttemptState, OwnerPinAttemptStore } from '../domain/owner-pin-attempt.port';
import { NO_OWNER_PIN_ATTEMPTS, reserveOwnerPinAttempt } from '../domain/owner-pin-lockout';

export type OwnerPinDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

export class DrizzleOwnerPinAttemptStore<TSchema extends Record<string, unknown>> implements OwnerPinAttemptStore {
  constructor(private readonly database: OwnerPinDatabase<TSchema>) {}

  async getState(merchantId: string): Promise<OwnerPinAttemptState> {
    const [row] = await this.database
      .select({ failedCount: ownerPinAttempts.failedCount, lockedUntil: ownerPinAttempts.lockedUntil })
      .from(ownerPinAttempts)
      .where(eq(ownerPinAttempts.merchantId, merchantId))
      .limit(1);
    return row ?? NO_OWNER_PIN_ATTEMPTS;
  }

  /**
   * The lock rule lives in reserveOwnerPinAttempt. This method only makes the
   * read-decide-write atomic by locking the merchant's row for the transaction.
   */
  async tryReserveAttempt(merchantId: string, now: Date): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx
        .insert(ownerPinAttempts)
        .values({ merchantId, failedCount: 0, lockedUntil: null, updatedAt: now })
        .onConflictDoNothing({ target: ownerPinAttempts.merchantId });

      const [row] = await tx
        .select({ failedCount: ownerPinAttempts.failedCount, lockedUntil: ownerPinAttempts.lockedUntil })
        .from(ownerPinAttempts)
        .where(eq(ownerPinAttempts.merchantId, merchantId))
        .limit(1)
        .for('update');

      const { allowed, next } = reserveOwnerPinAttempt(row ?? NO_OWNER_PIN_ATTEMPTS, now);
      if (allowed) {
        await tx
          .update(ownerPinAttempts)
          .set({ failedCount: next.failedCount, lockedUntil: next.lockedUntil, updatedAt: now })
          .where(eq(ownerPinAttempts.merchantId, merchantId));
      }
      return allowed;
    });
  }

  async reset(merchantId: string): Promise<void> {
    await this.database
      .update(ownerPinAttempts)
      .set({ failedCount: 0, lockedUntil: null })
      .where(eq(ownerPinAttempts.merchantId, merchantId));
  }
}
