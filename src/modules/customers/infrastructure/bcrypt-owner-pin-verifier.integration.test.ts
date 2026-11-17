import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';

// The real Drizzle repositories read the global `db`. Point it at the disposable test database.
const holder = vi.hoisted(() => ({ db: null as object | null }));
vi.mock('@/shared/infrastructure/db/connection', () => {
  const current = () => {
    if (!holder.db) throw new Error('Test database is not ready.');
    return holder.db;
  };
  return {
    getDb: current,
    db: new Proxy(
      {},
      {
        get(_target, prop) {
          const target = current();
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }
    ),
  };
});

import { merchants, appUsers, userAuthorities } from '@/modules/users/infrastructure/users.schema';
import { InvalidOwnerPinError } from '@/modules/customers/domain/errors';
import { CancelSaleUseCase, SaleNotFoundError } from '@/modules/sales/application/cancel-sale.use-case';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { BcryptOwnerPinVerifier } from './bcrypt-owner-pin-verifier';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('BcryptOwnerPinVerifier with two owners (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const createdUsernames: string[] = [];

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    holder.db = database;
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterEach(async () => {
    // Usernames are unique across stores, and this test needs the literal name 'owner'.
    for (const username of createdUsernames.splice(0)) {
      await database.delete(userAuthorities).where(eq(userAuthorities.username, username));
      await database.delete(appUsers).where(eq(appUsers.username, username));
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedTwoOwners() {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    for (const [username, pin] of [['owner', '111111'], ['maria', '222222']]) {
      await database.insert(appUsers).values({
        username,
        merchantId: merchant.id,
        passwordHash: 'not-used',
        authorizationPinHash: await bcrypt.hash(pin, 4),
        enabled: true,
      });
      await database
        .insert(userAuthorities)
        .values({ merchantId: merchant.id, username, authority: 'ROLE_OWNER' });
      createdUsernames.push(username);
    }
    return merchant.id;
  }

  it('aceita o PIN da dona "owner" quando ela é nomeada', async () => {
    const merchantId = await seedTwoOwners();
    const verifier = new BcryptOwnerPinVerifier();

    expect(await verifier.verifyOwnerPin(merchantId, 'owner', '111111')).toBe(true);
  });

  it('cancelamento sem ownerUsername aceita o PIN de outra dona (maria), mesmo existindo um usuário "owner"', async () => {
    const merchantId = await seedTwoOwners();
    const useCase = new CancelSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleCashSessionRepository(),
      new BcryptOwnerPinVerifier()
    );
    const dto = { merchantId, saleId: crypto.randomUUID(), operatorId: 'op-1', reason: 'teste' };

    // The PIN passes (the sale does not exist, so the next step fails), instead of InvalidOwnerPinError.
    await expect(useCase.execute({ ...dto, ownerPin: '222222' })).rejects.toBeInstanceOf(SaleNotFoundError);
    await expect(useCase.execute({ ...dto, ownerPin: '999999' })).rejects.toBeInstanceOf(InvalidOwnerPinError);
  });
});
