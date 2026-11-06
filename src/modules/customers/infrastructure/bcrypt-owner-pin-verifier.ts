import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { appUsers, userAuthorities } from '@/modules/users/infrastructure/users.schema';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import { UserRepository } from '@/modules/users/domain/user-repository.port';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';
import { OwnerPinAttemptStore } from '../domain/owner-pin-attempt.port';
import { DrizzleOwnerPinAttemptStore } from './drizzle-owner-pin-attempt-store';
import { db } from '@/shared/infrastructure/db/connection';

export class BcryptOwnerPinVerifier implements OwnerPinVerifier {
  constructor(
    private readonly userRepository: UserRepository = new DrizzleUserRepository(),
    private readonly attemptStore: OwnerPinAttemptStore = new DrizzleOwnerPinAttemptStore(db),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async verifyOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<boolean> {
    const now = this.clock();
    const allowed = await this.attemptStore.tryReserveAttempt(merchantId, now);
    if (!allowed) {
      return false;
    }

    const matched = await this.matchOwnerPin(merchantId, ownerUsername, pin, now);
    if (matched) {
      await this.attemptStore.reset(merchantId);
    }
    return matched;
  }

  private async matchOwnerPin(merchantId: string, ownerUsername: string, pin: string, now: Date): Promise<boolean> {
    if (!pin || typeof pin !== 'string') {
      return false;
    }

    const trimmedPin = pin.trim();
    if (!trimmedPin) {
      return false;
    }

    const normalizedUsername = ownerUsername?.trim().toLowerCase();

    // 1. If username is provided, check that specific user
    if (normalizedUsername) {
      const user = await this.userRepository.findByUsername(normalizedUsername);
      if (user) {
        return user.canAuthorizePin(merchantId)
          ? bcrypt.compare(trimmedPin, user.authorizationPinHash!)
          : false;
      }
    }

    // 2. Fallback: If no username or username was not found, find any active owner of the merchant with ROLE_OWNER
    const ownerRows = await db
      .select({
        authorizationPinHash: appUsers.authorizationPinHash,
        enabled: appUsers.enabled,
        lockedUntil: appUsers.lockedUntil,
      })
      .from(appUsers)
      .innerJoin(
        userAuthorities,
        and(
          eq(userAuthorities.merchantId, appUsers.merchantId),
          eq(userAuthorities.username, appUsers.username),
          eq(userAuthorities.authority, 'ROLE_OWNER')
        )
      )
      .where(
        and(
          eq(appUsers.merchantId, merchantId),
          eq(appUsers.enabled, true)
        )
      );

    for (const owner of ownerRows) {
      if (owner.lockedUntil && owner.lockedUntil.getTime() > now.getTime()) {
        continue;
      }
      if (owner.authorizationPinHash) {
        const matches = await bcrypt.compare(trimmedPin, owner.authorizationPinHash);
        if (matches) {
          return true;
        }
      }
    }

    return false;
  }
}
