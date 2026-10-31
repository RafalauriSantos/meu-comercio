import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { appUsers, userAuthorities } from '@/modules/users/infrastructure/users.schema';
import { DrizzleUserRepository } from '@/modules/users/infrastructure/drizzle-user-repository';
import { UserRepository } from '@/modules/users/domain/user-repository.port';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';

export class BcryptOwnerPinVerifier implements OwnerPinVerifier {
  constructor(private readonly userRepository: UserRepository = new DrizzleUserRepository()) {}

  async verifyOwnerPin(merchantId: string, ownerUsername: string, pin: string): Promise<boolean> {
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
      if (owner.lockedUntil && owner.lockedUntil.getTime() > Date.now()) {
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
