import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { Money } from '@/shared/domain/money';
import { customers, customerCreditLedger } from './customers.schema';
import { DrizzleCustomerRepository } from './drizzle-customer-repository';
import { CustomerChangedError, InvalidCreditLimitError, OwnerPinRequiredError } from '../domain/errors';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleCustomerRepository.updateDetails, credit limit (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let repo: DrizzleCustomerRepository;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
    repo = new DrizzleCustomerRepository(database);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function freshMerchant(): Promise<string> {
    const [row] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    return row.id;
  }

  async function seed(merchantId: string, phone: string, extra: Partial<typeof customers.$inferInsert> = {}) {
    const [row] = await database
      .insert(customers)
      .values({ merchantId, name: `Cliente ${phone}`, phone, creditLimit: '150.0000', ...extra })
      .returning();
    return row;
  }

  async function row(id: string) {
    const [found] = await database.select().from(customers).where(eq(customers.id, id));
    return found;
  }

  async function auditOf(id: string) {
    return database.select().from(auditEvents).where(eq(auditEvents.aggregateId, id));
  }

  async function ledgerOf(id: string) {
    return database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, id));
  }

  // D-22: most edits here raise the limit, so the default actor carries the owner authorization.
  const ACTOR = { actorId: 'dona', limitIncreaseAuthorizedBy: 'dona' };
  const NO_AUTH = { actorId: 'caixa' };
  const limit = (value: string) => ({ creditLimit: Money.fromDecimal(value) });

  it('editing the limit writes only the limit and bumps updated_at', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { name: 'Maria' });

    const result = await repo.updateDetails(merchantId, customer.id, limit('200.50'), ACTOR);

    const after = await row(customer.id);
    expect(after).toMatchObject({
      name: 'Maria',
      phone: '11999998888',
      creditLimit: '200.5000',
      active: true,
      createdAt: customer.createdAt,
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(customer.updatedAt.getTime());
    expect(result?.creditLimit.toDecimal()).toBe('200.50');
  });

  it('a limit below the current debt is accepted and the balance and statement stay identical', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    await database.insert(customerCreditLedger).values([
      { merchantId, customerId: customer.id, type: 'DEBIT', amount: '120.0000', operatorId: 'caixa' },
      { merchantId, customerId: customer.id, type: 'CREDIT', amount: '20.0000', operatorId: 'caixa' },
    ]);
    const ledgerBefore = await ledgerOf(customer.id);

    const result = await repo.updateDetails(merchantId, customer.id, limit('10.00'), ACTOR);

    expect(result?.creditLimit.toDecimal()).toBe('10.00');
    expect((await row(customer.id)).creditLimit).toBe('10.0000');
    const ledgerAfter = await ledgerOf(customer.id);
    expect(ledgerAfter).toEqual(ledgerBefore);
    const debt = ledgerAfter.reduce((sum, m) => sum.add(Money.fromDecimal(m.amount).multiply(m.type === 'DEBIT' ? 1 : -1)), Money.zero());
    expect(debt.toDecimal()).toBe('100.00');
  });

  it('the limit may be zero', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('0'), ACTOR);

    expect((await row(customer.id)).creditLimit).toBe('0.0000');
  });

  it('the audit stores the limit before and after as text with two decimals, never a number', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('150.05'), { actorId: 'tatiane', limitIncreaseAuthorizedBy: 'tatiane' });

    const events = await auditOf(customer.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ merchantId, eventType: 'CUSTOMER_UPDATED', actorId: 'tatiane', aggregateType: 'CUSTOMER' });
    expect(events[0].details).toEqual({ changes: { creditLimit: { from: '150.00', to: '150.05' } }, authorizedBy: 'tatiane' });
  });

  it('if the audit fails the limit stays as it was (one transaction)', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    // actor_id is varchar(120): a longer value makes the audit insert fail after the customer update.
    await expect(repo.updateDetails(merchantId, customer.id, limit('300.00'), { actorId: 'x'.repeat(200), limitIncreaseAuthorizedBy: 'dona' })).rejects.toThrow();

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('D-22: an increase without owner authorization is refused and nothing is written', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await expect(repo.updateDetails(merchantId, customer.id, { name: 'Não deve ficar', ...limit('150.01') }, NO_AUTH)).rejects.toBeInstanceOf(
      OwnerPinRequiredError
    );

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('D-22: keeping or lowering the limit needs no authorization and the audit has no authorizedBy', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('150.00'), NO_AUTH);
    await repo.updateDetails(merchantId, customer.id, limit('20.00'), NO_AUTH);

    expect((await row(customer.id)).creditLimit).toBe('20.0000');
    const events = await auditOf(customer.id);
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ changes: { creditLimit: { from: '150.00', to: '20.00' } } });
  });

  it('D-22: a customer above the ceiling is read and edited (name only) without error', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { creditLimit: '100000.0000' });

    expect((await repo.findById(merchantId, customer.id))?.creditLimit.toDecimal()).toBe('100000.00');
    await repo.updateDetails(merchantId, customer.id, { name: 'Maria Souza' }, NO_AUTH);

    expect(await row(customer.id)).toMatchObject({ name: 'Maria Souza', creditLimit: '100000.0000' });
  });

  it('D-22 race: a limit that looked like a reduction but is an increase under the lock is refused', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888'); // limit 150
    const where = and(eq(customers.merchantId, merchantId), eq(customers.id, customer.id));

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    // Another edit lowers the limit to 50 and holds the lock while the 100.00 edit (a reduction from 150) waits.
    const other = database.transaction(async (tx) => {
      await tx.select({ id: customers.id }).from(customers).where(where).for('update');
      locked();
      await held;
      await tx.update(customers).set({ creditLimit: '50.0000' }).where(where);
    });
    await lockTaken;

    const edit = repo.updateDetails(merchantId, customer.id, limit('100.00'), NO_AUTH);
    const outcome = edit.then(() => 'written', (error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await other;

    expect(await outcome).toBeInstanceOf(OwnerPinRequiredError);
    expect((await row(customer.id)).creditLimit).toBe('50.0000');
  });

  it('a limit with cents round-trips exactly', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('150.05'), ACTOR);

    expect((await row(customer.id)).creditLimit).toBe('150.0500');
    expect((await repo.findById(merchantId, customer.id))?.creditLimit.toDecimal()).toBe('150.05');
    expect((await repo.findAllActive(merchantId))[0].toJSON().creditLimit).toBe('150.05');
  });

  it('the ceiling R$ 500.00 is accepted', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('500.00'), ACTOR);

    expect((await row(customer.id)).creditLimit).toBe('500.0000');
  });

  it.each(['500.01', '-0.01'])('the limit %s is refused and nothing is written', async (value) => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await expect(repo.updateDetails(merchantId, customer.id, { name: 'Não deve ficar', ...limit(value) }, ACTOR)).rejects.toThrow(
      InvalidCreditLimitError
    );

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('an old expectedUpdatedAt does not write the limit', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await expect(
      repo.updateDetails(merchantId, customer.id, limit('500.00'), { ...ACTOR, expectedUpdatedAt: new Date(customer.updatedAt.getTime() - 5000) })
    ).rejects.toBeInstanceOf(CustomerChangedError);

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('two simultaneous limit edits from the same state: one wins and the other is warned', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    const token = customer.updatedAt;

    const results = await Promise.allSettled([
      repo.updateDetails(merchantId, customer.id, limit('300.00'), { ...ACTOR, expectedUpdatedAt: token }),
      repo.updateDetails(merchantId, customer.id, limit('400.00'), { ...ACTOR, expectedUpdatedAt: token }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(CustomerChangedError);
    expect(await auditOf(customer.id)).toHaveLength(1);
  });

  it('name and limit together are one transaction with one audit event', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { name: 'Maria' });

    await repo.updateDetails(merchantId, customer.id, { name: 'Maria Souza', ...limit('75.10') }, ACTOR);

    expect(await row(customer.id)).toMatchObject({ name: 'Maria Souza', creditLimit: '75.1000', phone: '11999998888' });
    const events = await auditOf(customer.id);
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({
      changes: { name: { from: 'Maria', to: 'Maria Souza' }, creditLimit: { from: '150.00', to: '75.10' } },
    });
  });

  it('the same limit written another way is not a change: no write and no audit', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, limit('150'), ACTOR);

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('a customer of another shop is not found and its limit is not changed', async () => {
    const merchantId = await freshMerchant();
    const otherShop = await freshMerchant();
    const theirs = await seed(otherShop, '11999998888');
    const mine = await seed(merchantId, '11911110001');

    expect(await repo.updateDetails(merchantId, theirs.id, limit('1.00'), ACTOR)).toBeNull();
    await repo.updateDetails(merchantId, mine.id, limit('2.00'), ACTOR);

    expect(await row(theirs.id)).toEqual(theirs);
    expect(await auditOf(theirs.id)).toHaveLength(0);
  });

  it('the limit edit waits for a credit sale that holds the customer lock', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    const where = and(eq(customers.merchantId, merchantId), eq(customers.id, customer.id));

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    // Same lock the credit sale takes (drizzle-sale-repository applyCreditDebit).
    const sale = database.transaction(async (tx) => {
      await tx.select({ id: customers.id }).from(customers).where(where).for('update');
      locked();
      await held;
    });
    await lockTaken;

    let finished = false;
    const edit = repo.updateDetails(merchantId, customer.id, limit('400.00'), ACTOR).then(() => (finished = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(finished).toBe(false);
    expect((await row(customer.id)).creditLimit).toBe('150.0000');

    release();
    await sale;
    await edit;
    expect((await row(customer.id)).creditLimit).toBe('400.0000');
  });
});
