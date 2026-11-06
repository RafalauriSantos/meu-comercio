import { eq } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { ownerPinAttempts } from './customers.schema';
import { OwnerPinAttemptState, OwnerPinAttemptStore } from '../domain/owner-pin-attempt.port';
import { NO_OWNER_PIN_ATTEMPTS } from '../domain/owner-pin-lockout';

export class DrizzleOwnerPinAttemptStore implements OwnerPinAttemptStore {
  async getState(merchantId: string): Promise<OwnerPinAttemptState> {
    const [row] = await db
      .select({ failedCount: ownerPinAttempts.failedCount, lockedUntil: ownerPinAttempts.lockedUntil })
      .from(ownerPinAttempts)
      .where(eq(ownerPinAttempts.merchantId, merchantId))
      .limit(1);
    return row ?? NO_OWNER_PIN_ATTEMPTS;
  }

  async saveState(merchantId: string, state: OwnerPinAttemptState): Promise<void> {
    await db
      .insert(ownerPinAttempts)
      .values({
        merchantId,
        failedCount: state.failedCount,
        lockedUntil: state.lockedUntil,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ownerPinAttempts.merchantId,
        set: { failedCount: state.failedCount, lockedUntil: state.lockedUntil, updatedAt: new Date() },
      });
  }
}
