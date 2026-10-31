import { eq, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { merchants, appUsers, userAuthorities } from './users.schema';
import { User, UserAuthority } from '../domain/user';
import { UserRepository, CreateMerchantWithOwnerParams } from '../domain/user-repository.port';

export class DrizzleUserRepository implements UserRepository {
  async hasAnyUser(): Promise<boolean> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(appUsers);
    return (result[0]?.count ?? 0) > 0;
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalized = username.trim().toLowerCase();
    const userRows = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, normalized))
      .limit(1);

    if (userRows.length === 0) {
      return null;
    }

    const userRow = userRows[0];
    const authRows = await db
      .select({ authority: userAuthorities.authority })
      .from(userAuthorities)
      .where(eq(userAuthorities.username, normalized));

    return new User({
      username: userRow.username,
      merchantId: userRow.merchantId,
      passwordHash: userRow.passwordHash,
      authorizationPinHash: userRow.authorizationPinHash,
      email: userRow.email,
      enabled: userRow.enabled,
      failedLoginAttempts: userRow.failedLoginAttempts,
      lockedUntil: userRow.lockedUntil,
      authorities: authRows.map(r => r.authority as UserAuthority),
      createdAt: userRow.createdAt,
    });
  }

  async createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User> {
    return db.transaction(async (tx) => {
      // 1. Create the initial merchant
      const [merchant] = await tx
        .insert(merchants)
        .values({
          name: params.merchantName,
        })
        .returning();

      const normalizedUsername = params.username.trim().toLowerCase();

      // 2. Create the owner user
      const [userRow] = await tx
        .insert(appUsers)
        .values({
          username: normalizedUsername,
          merchantId: merchant.id,
          passwordHash: params.passwordHash,
          authorizationPinHash: params.authorizationPinHash,
          email: params.email ? params.email.trim().toLowerCase() : null,
          enabled: true,
          failedLoginAttempts: 0,
        })
        .returning();

      // 3. Grant authorities
      if (params.authorities.length > 0) {
        await tx.insert(userAuthorities).values(
          params.authorities.map(auth => ({
            merchantId: merchant.id,
            username: normalizedUsername,
            authority: auth,
          }))
        );
      }

      return new User({
        username: userRow.username,
        merchantId: merchant.id,
        passwordHash: userRow.passwordHash,
        authorizationPinHash: userRow.authorizationPinHash,
        email: userRow.email,
        enabled: userRow.enabled,
        failedLoginAttempts: userRow.failedLoginAttempts,
        lockedUntil: userRow.lockedUntil,
        authorities: params.authorities,
        createdAt: userRow.createdAt,
      });
    });
  }

  async updateFailedLoginAttempts(username: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    await db
      .update(appUsers)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil,
      })
      .where(eq(appUsers.username, username.trim().toLowerCase()));
  }

  async resetFailedLoginAttempts(username: string): Promise<void> {
    await db
      .update(appUsers)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(appUsers.username, username.trim().toLowerCase()));
  }
}
