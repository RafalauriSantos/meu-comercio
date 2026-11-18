import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { customers, customerCreditLedger, ownerPinAttempts } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { Money } from '@/shared/domain/money';
import { CustomerHasDebtError, InvalidOwnerPinError, OwnerPinRequiredError } from '../domain/errors';
import { DrizzleCustomerRepository } from '../infrastructure/drizzle-customer-repository';
import { BcryptOwnerPinVerifier } from '../infrastructure/bcrypt-owner-pin-verifier';
import { CreateCustomerUseCase } from './create-customer.use-case';
import { UpdateCustomerUseCase } from './update-customer.use-case';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PIN = '123456';
const WRONG_PIN = '654321';

describe.skipIf(!TEST_DATABASE_URL)('Credit limit increase needs the owner PIN, D-22 and D-29 (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    holder.db = database;
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  const update = () => new UpdateCustomerUseCase(new DrizzleCustomerRepository(), new BcryptOwnerPinVerifier());
  const create = () => new CreateCustomerUseCase(new DrizzleCustomerRepository(), new DrizzleAuditAdapter(), new BcryptOwnerPinVerifier());

  async function seedStore(creditLimit = '100.00') {
    const random = Math.random().toString(36).slice(2);
    const [merchant] = await database.insert(merchants).values({ name: `Loja ${random}` }).returning({ id: merchants.id });
    const merchantId = merchant.id;
    const ownerUsername = `dona_${random}`;
    await database.insert(appUsers).values({
      username: ownerUsername,
      merchantId,
      passwordHash: 'not-used',
      authorizationPinHash: await bcrypt.hash(OWNER_PIN, 4),
      enabled: true,
    });
    await database.insert(userAuthorities).values({ merchantId, username: ownerUsername, authority: 'ROLE_OWNER' });
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit })
      .returning({ id: customers.id });
    return { merchantId, ownerUsername, customerId: customer.id };
  }

  const limitOf = async (id: string) => (await database.select().from(customers).where(eq(customers.id, id)))[0].creditLimit;
  const attemptsOf = async (merchantId: string) =>
    (await database.select().from(ownerPinAttempts).where(eq(ownerPinAttempts.merchantId, merchantId)))[0];
  const auditsOf = (merchantId: string) => database.select().from(auditEvents).where(eq(auditEvents.merchantId, merchantId));

  it('PATCH: increase without PIN is refused without spending an attempt; reduction needs no PIN', async () => {
    const seed = await seedStore('100.00');

    await expect(update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '100.01' })).rejects.toBeInstanceOf(
      OwnerPinRequiredError
    );
    expect(await limitOf(seed.customerId)).toBe('100.0000');
    expect(await attemptsOf(seed.merchantId)).toBeUndefined();

    await update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '40.00' });
    expect(await limitOf(seed.customerId)).toBe('40.0000');
  });

  it('PATCH: the right PIN raises the limit, audits who authorized it, never the PIN, and clears the counter', async () => {
    const seed = await seedStore('100.00');

    await expect(
      update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '250.00', ownerPin: WRONG_PIN })
    ).rejects.toBeInstanceOf(InvalidOwnerPinError);
    expect((await attemptsOf(seed.merchantId)).failedCount).toBe(1);
    expect(await limitOf(seed.customerId)).toBe('100.0000');

    await update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '250.00', ownerPin: OWNER_PIN });

    expect(await limitOf(seed.customerId)).toBe('250.0000');
    expect((await attemptsOf(seed.merchantId)).failedCount).toBe(0);
    const events = await auditsOf(seed.merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ changes: { creditLimit: { from: '100.00', to: '250.00' } }, authorizedBy: seed.ownerUsername });
    expect(JSON.stringify(events)).not.toContain(OWNER_PIN);
    expect(JSON.stringify(events)).not.toContain(WRONG_PIN);
  });

  it('PATCH: 5 wrong PINs lock the store PIN, so even the right PIN is refused and nothing is written', async () => {
    const seed = await seedStore('100.00');

    for (let i = 0; i < 5; i += 1) {
      await expect(
        update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '250.00', ownerPin: WRONG_PIN })
      ).rejects.toBeInstanceOf(InvalidOwnerPinError);
    }
    const state = await attemptsOf(seed.merchantId);
    expect(state.failedCount).toBe(5);
    expect(state.lockedUntil).not.toBeNull();

    await expect(
      update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { creditLimit: '250.00', ownerPin: OWNER_PIN })
    ).rejects.toBeInstanceOf(InvalidOwnerPinError);
    expect(await limitOf(seed.customerId)).toBe('100.0000');
    expect(await auditsOf(seed.merchantId)).toHaveLength(0);
  });

  it('PATCH D-22 + D-27: exclusion plus a limit increase without PIN is refused as a whole, nothing is written', async () => {
    const seed = await seedStore('100.00');

    await expect(
      update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { active: false, name: 'Ana Souza', creditLimit: '200.00' })
    ).rejects.toBeInstanceOf(OwnerPinRequiredError);

    const [row] = await database.select().from(customers).where(eq(customers.id, seed.customerId));
    expect(row).toMatchObject({ active: true, name: 'Ana', creditLimit: '100.0000' });
    expect(await auditsOf(seed.merchantId)).toHaveLength(0);
  });

  it('PATCH D-22 + D-27: exclusion with the right PIN and a raised limit is one transaction with one event', async () => {
    const seed = await seedStore('100.00');

    await update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, {
      active: false,
      name: 'Ana Souza',
      creditLimit: '200.00',
      ownerPin: OWNER_PIN,
    });

    const [row] = await database.select().from(customers).where(eq(customers.id, seed.customerId));
    expect(row).toMatchObject({ active: false, name: 'Ana Souza', creditLimit: '200.0000' });
    const events = await auditsOf(seed.merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({
      changes: { active: { from: true, to: false }, creditLimit: { from: '100.00', to: '200.00' } },
      authorizedBy: seed.ownerUsername,
    });
  });

  it('PATCH D-27: excluding a customer with debt is still refused (CustomerHasDebtError) and the other fields roll back', async () => {
    const seed = await seedStore('100.00');
    await database.insert(customerCreditLedger).values({
      merchantId: seed.merchantId,
      customerId: seed.customerId,
      type: 'DEBIT',
      amount: '0.01',
      operatorId: 'op-1',
    });

    await expect(
      update().execute(seed.merchantId, seed.ownerUsername, seed.customerId, { active: false, name: 'Ana Souza', creditLimit: '50.00' })
    ).rejects.toBeInstanceOf(CustomerHasDebtError);

    const [row] = await database.select().from(customers).where(eq(customers.id, seed.customerId));
    expect(row).toMatchObject({ active: true, name: 'Ana', creditLimit: '100.0000' });
    expect(await auditsOf(seed.merchantId)).toHaveLength(0);
  });

  it('POST: the owner registers a customer with a limit using the PIN; the audit has authorizedBy and no PIN', async () => {
    const seed = await seedStore();
    const input = {
      merchantId: seed.merchantId,
      name: 'Nova',
      phone: '11977776666',
      creditLimit: Money.fromDecimal('300.00'),
      actorIsOwner: true,
      operatorId: seed.ownerUsername,
    };

    await expect(create().execute(input)).rejects.toBeInstanceOf(OwnerPinRequiredError);
    await expect(create().execute({ ...input, ownerPin: WRONG_PIN })).rejects.toBeInstanceOf(InvalidOwnerPinError);
    const customer = await create().execute({ ...input, ownerPin: OWNER_PIN });

    expect(await limitOf(customer.id)).toBe('300.0000');
    const events = await auditsOf(seed.merchantId);
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ creditLimit: '300.00', authorizedBy: seed.ownerUsername });
    expect(JSON.stringify(events)).not.toContain(OWNER_PIN);
  });
});
