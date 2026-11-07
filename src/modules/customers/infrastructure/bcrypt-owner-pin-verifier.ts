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
    return (await this.authorizeOwnerPin(merchantId, ownerUsername, pin)) !== null;
  }

  async authorizeOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<string | null> {
    const now = this.clock();
    const allowed = await this.attemptStore.tryReserveAttempt(merchantId, now);
    if (!allowed) {
      return null;
    }

    const authorizer = await this.matchOwnerPin(merchantId, ownerUsername, pin, now);
    if (authorizer !== null) {
      await this.attemptStore.reset(merchantId);
    }
    return authorizer;
  }

  private async matchOwnerPin(
    merchantId: string,
    ownerUsername: string,
    pin: string,
    now: Date
  ): Promise<string | null> {
    if (!pin || typeof pin !== 'string') {
      return null;
    }

    const trimmedPin = pin.trim();
    if (!trimmedPin) {
      return null;
    }

    const normalizedUsername = ownerUsername?.trim().toLowerCase();

    // 1. If username is provided, check that specific user
    if (normalizedUsername) {
      const user = await this.userRepository.findByUsername(normalizedUsername);
      if (user) {
        const pinHash = user.authorizationPinHash;
        const ok =
          user.canAuthorizePin(merchantId, now) &&
          pinHash !== null &&
          (await bcrypt.compare(trimmedPin, pinHash));
        return ok ? user.username : null;
      }
    }

    // 2. Fallback: If no username or username was not found, find any active owner of the merchant with ROLE_OWNER
    const ownerRows = await db
      .select({
        username: appUsers.username,
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
          return owner.username;
        }
      }
    }

    return null;
  }
}
