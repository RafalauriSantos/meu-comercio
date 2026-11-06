import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { ownerPinAttempts } from './customers.schema';
import { OwnerPinAttemptState, OwnerPinAttemptStore } from '../domain/owner-pin-attempt.port';
import { NO_OWNER_PIN_ATTEMPTS, OWNER_PIN_LOCK_MINUTES, OWNER_PIN_MAX_FAILURES } from '../domain/owner-pin-lockout';

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
   * One conditional UPDATE decides the attempt in the database, so concurrent
   * requests cannot all pass the lock check. A missing row is created by INSERT.
   */
  async tryReserveAttempt(merchantId: string, now: Date): Promise<boolean> {
    if (await this.updateOpenAttempt(merchantId, now)) {
      return true;
    }

    const inserted = await this.database
      .insert(ownerPinAttempts)
      .values({ merchantId, failedCount: 1, lockedUntil: null, updatedAt: now })
      .onConflictDoNothing({ target: ownerPinAttempts.merchantId })
      .returning({ failedCount: ownerPinAttempts.failedCount });
    if (inserted.length > 0) {
      return true;
    }

    // Another request inserted the row first. Retry the conditional UPDATE once.
    return this.updateOpenAttempt(merchantId, now);
  }

  private async updateOpenAttempt(merchantId: string, now: Date): Promise<boolean> {
    const updated = await this.database
      .update(ownerPinAttempts)
      .set({
        failedCount: sql`${ownerPinAttempts.failedCount} + 1`,
        lockedUntil: sql`CASE WHEN ${ownerPinAttempts.failedCount} + 1 >= ${OWNER_PIN_MAX_FAILURES}
          THEN ${now}::timestamptz + (${OWNER_PIN_LOCK_MINUTES} * interval '1 minute')
          ELSE NULL END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(ownerPinAttempts.merchantId, merchantId),
          sql`(${ownerPinAttempts.lockedUntil} IS NULL OR ${ownerPinAttempts.lockedUntil} <= ${now}::timestamptz)`
        )
      )
      .returning({ failedCount: ownerPinAttempts.failedCount });
    return updated.length > 0;
  }

  async reset(merchantId: string): Promise<void> {
    await this.database
      .update(ownerPinAttempts)
      .set({ failedCount: 0, lockedUntil: null })
      .where(eq(ownerPinAttempts.merchantId, merchantId));
  }
}
