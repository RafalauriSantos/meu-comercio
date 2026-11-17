import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { customers, customerCreditLedger } from './customers.schema';
import { DrizzleCustomerRepository } from './drizzle-customer-repository';
import { CustomerAlreadyExistsError, CustomerChangedError, InvalidPhoneError } from '../domain/errors';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleCustomerRepository.updateDetails (Postgres)', () => {
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

  const ACTOR = { actorId: 'dona' };

  it('a partial update changes only what was sent and keeps limit, active and created_at', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { name: 'Maria' });

    const result = await repo.updateDetails(merchantId, customer.id, { name: '  Maria Souza ' }, ACTOR);

    const after = await row(customer.id);
    expect(result?.name).toBe('Maria Souza');
    expect(after).toMatchObject({
      name: 'Maria Souza',
      phone: '11999998888',
      creditLimit: '150.0000',
      active: true,
      createdAt: customer.createdAt,
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(customer.updatedAt.getTime());
    expect(result?.updatedAt).toEqual(after.updatedAt);
  });

  it('a new phone is stored as digits only', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await repo.updateDetails(merchantId, customer.id, { phone: '+55 (11) 98888-7777' }, ACTOR);

    expect((await row(customer.id)).phone).toBe('11988887777');
  });

  it('an invalid phone is refused and writes nothing', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await expect(repo.updateDetails(merchantId, customer.id, { phone: '123' }, ACTOR)).rejects.toThrow(InvalidPhoneError);

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('a phone used by another customer, in another format, is a conflict and changes nobody', async () => {
    const merchantId = await freshMerchant();
    const mine = await seed(merchantId, '11999998888');
    const other = await seed(merchantId, '(11) 98888-7777');

    const attempt = repo.updateDetails(merchantId, mine.id, { phone: '11988887777', name: 'Outro nome' }, ACTOR);

    await expect(attempt).rejects.toBeInstanceOf(CustomerAlreadyExistsError);
    await expect(attempt).rejects.not.toThrow(/idx_customers|duplicate key|regexp/);
    expect(await row(mine.id)).toEqual(mine);
    expect(await row(other.id)).toEqual(other);
    expect(await auditOf(mine.id)).toHaveLength(0);
  });

  it('the same phone as the customer itself, in another format, is not a conflict', async () => {
    const merchantId = await freshMerchant();
    const legacy = await seed(merchantId, '(11) 99999-8888');

    await repo.updateDetails(merchantId, legacy.id, { phone: '11999998888' }, ACTOR);

    expect((await row(legacy.id)).phone).toBe('11999998888');
    expect(await auditOf(legacy.id)).toHaveLength(1);
  });

  it('a legacy phone outside the pattern of ANOTHER customer in the same shop stays untouched', async () => {
    const merchantId = await freshMerchant();
    const mine = await seed(merchantId, '11999998888');
    const legacy = await seed(merchantId, '(11) 9999');

    await repo.updateDetails(merchantId, mine.id, { name: 'Novo' }, ACTOR);
    await repo.updateDetails(merchantId, mine.id, { phone: '11988887777' }, ACTOR);

    expect(await row(legacy.id)).toEqual(legacy);
  });

  it('editing only the name of a customer with a legacy phone neither requires nor changes the phone', async () => {
    const merchantId = await freshMerchant();
    const legacy = await seed(merchantId, '(11) 9999');

    await repo.updateDetails(merchantId, legacy.id, { name: 'Dona Antiga' }, ACTOR);

    const after = await row(legacy.id);
    expect(after.name).toBe('Dona Antiga');
    expect(after.phone).toBe('(11) 9999');
  });

  it('two edits racing for the same new phone: one wins, the other is a domain conflict, nobody is overwritten', async () => {
    const merchantId = await freshMerchant();
    const a = await seed(merchantId, '11911110001');
    const b = await seed(merchantId, '11911110002');

    const results = await Promise.allSettled([
      repo.updateDetails(merchantId, a.id, { phone: '11977776666' }, ACTOR),
      repo.updateDetails(merchantId, b.id, { phone: '(11) 97777-6666' }, ACTOR),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CustomerAlreadyExistsError);
    const phones = [(await row(a.id)).phone, (await row(b.id)).phone];
    expect(phones.filter((p) => p === '11977776666')).toHaveLength(1);
    expect(phones.filter((p) => p === '11911110001' || p === '11911110002')).toHaveLength(1);
  });

  it('a customer of another shop is not found and not changed', async () => {
    const merchantId = await freshMerchant();
    const otherShop = await freshMerchant();
    const theirs = await seed(otherShop, '11999998888');

    const result = await repo.updateDetails(merchantId, theirs.id, { name: 'Invasor' }, ACTOR);

    expect(result).toBeNull();
    expect(await row(theirs.id)).toEqual(theirs);
    expect(await auditOf(theirs.id)).toHaveLength(0);
  });

  it('the same phone may exist in two shops: editing one does not touch the other', async () => {
    const merchantId = await freshMerchant();
    const otherShop = await freshMerchant();
    const mine = await seed(merchantId, '11911110001');
    const theirs = await seed(otherShop, '11999998888');

    await repo.updateDetails(merchantId, mine.id, { phone: '11999998888' }, ACTOR);

    expect((await row(mine.id)).phone).toBe('11999998888');
    expect(await row(theirs.id)).toEqual(theirs);
  });

  it('a customer that does not exist is not found', async () => {
    const merchantId = await freshMerchant();

    expect(await repo.updateDetails(merchantId, '22222222-2222-4222-8222-222222222222', { name: 'X' }, ACTOR)).toBeNull();
  });

  it('an old expectedUpdatedAt is a conflict and writes nothing', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    await expect(
      repo.updateDetails(merchantId, customer.id, { name: 'Novo' }, { ...ACTOR, expectedUpdatedAt: new Date(customer.updatedAt.getTime() - 5000) })
    ).rejects.toBeInstanceOf(CustomerChangedError);

    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('a current expectedUpdatedAt writes; then the same value is old and conflicts (A saves, B is warned)', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    const token = new Date(customer.updatedAt.getTime());

    await repo.updateDetails(merchantId, customer.id, { name: 'A salvou' }, { ...ACTOR, expectedUpdatedAt: token });

    await expect(
      repo.updateDetails(merchantId, customer.id, { name: 'B salvou' }, { ...ACTOR, expectedUpdatedAt: token })
    ).rejects.toBeInstanceOf(CustomerChangedError);
    expect((await row(customer.id)).name).toBe('A salvou');
  });

  it('two simultaneous edits from the same state: one wins and the other is warned', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    const token = customer.updatedAt;

    const results = await Promise.allSettled([
      repo.updateDetails(merchantId, customer.id, { name: 'Um' }, { ...ACTOR, expectedUpdatedAt: token }),
      repo.updateDetails(merchantId, customer.id, { name: 'Dois' }, { ...ACTOR, expectedUpdatedAt: token }),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(CustomerChangedError);
    expect(await auditOf(customer.id)).toHaveLength(1);
  });

  it('the updatedAt the list returns (ISO) is the stored one: it passes as expectedUpdatedAt', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    const [listed] = await repo.findAllActive(merchantId);

    const result = await repo.updateDetails(
      merchantId,
      customer.id,
      { name: 'Pela lista' },
      { ...ACTOR, expectedUpdatedAt: new Date(listed.toJSON().updatedAt) }
    );

    expect(result?.name).toBe('Pela lista');
  });

  it('nothing changed: returns the customer, writes no audit and keeps updated_at', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { name: 'Maria' });

    const result = await repo.updateDetails(merchantId, customer.id, { name: ' Maria ', phone: '(11) 99999-8888' }, ACTOR);

    expect(result?.id).toBe(customer.id);
    expect(await row(customer.id)).toEqual(customer);
    expect(await auditOf(customer.id)).toHaveLength(0);
  });

  it('records exactly one CUSTOMER_UPDATED with from and to of only the changed fields', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '(11) 99999-8888', { name: 'Maria' });

    await repo.updateDetails(merchantId, customer.id, { name: 'Maria Souza', phone: '11988887777' }, { actorId: 'tatiane' });
    await repo.updateDetails(merchantId, customer.id, { name: 'Maria Souza' }, ACTOR);

    const events = await auditOf(customer.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      merchantId,
      eventType: 'CUSTOMER_UPDATED',
      actorId: 'tatiane',
      aggregateType: 'CUSTOMER',
      aggregateId: customer.id,
    });
    expect(events[0].details).toEqual({
      changes: {
        name: { from: 'Maria', to: 'Maria Souza' },
        phone: { from: '(11) 99999-8888', to: '11988887777' },
      },
    });
  });

  it('if the audit fails the customer stays as it was (one transaction)', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');

    // actor_id is varchar(120): a longer value makes the audit insert fail after the customer update.
    await expect(
      repo.updateDetails(merchantId, customer.id, { name: 'Não deve ficar', phone: '11988887777' }, { actorId: 'x'.repeat(200) })
    ).rejects.toThrow();

    expect(await row(customer.id)).toEqual(customer);
  });

  it('a customer with open fiado can be edited and the balance and statement stay intact', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888', { name: 'Maria' });
    await database.insert(customerCreditLedger).values([
      { merchantId, customerId: customer.id, type: 'DEBIT', amount: '100.0000', operatorId: 'caixa' },
      { merchantId, customerId: customer.id, type: 'CREDIT', amount: '30.0000', operatorId: 'caixa' },
    ]);
    const ledgerBefore = await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, customer.id));

    await repo.updateDetails(merchantId, customer.id, { name: 'Maria Souza', phone: '11988887777' }, ACTOR);

    const ledgerAfter = await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, customer.id));
    expect(ledgerAfter).toHaveLength(2);
    expect(ledgerAfter).toEqual(ledgerBefore);
    const debt = ledgerAfter.reduce((sum, m) => sum + (m.type === 'DEBIT' ? 1 : -1) * Number(m.amount), 0);
    expect(debt).toBe(70);
    expect((await row(customer.id)).creditLimit).toBe('150.0000');
  });

  it('when the stored updated_at is ahead of the clock (clock jumped back), the new updatedAt is still greater and the old token conflicts', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    await database
      .update(customers)
      .set({ updatedAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(customers.id, customer.id));
    const previous = (await row(customer.id)).updatedAt;

    const result = await repo.updateDetails(merchantId, customer.id, { name: 'Novo' }, { ...ACTOR, expectedUpdatedAt: previous });

    expect(result!.updatedAt.getTime()).toBeGreaterThan(previous.getTime());
    expect((await row(customer.id)).updatedAt).toEqual(result!.updatedAt);
    await expect(
      repo.updateDetails(merchantId, customer.id, { name: 'Outro' }, { ...ACTOR, expectedUpdatedAt: previous })
    ).rejects.toBeInstanceOf(CustomerChangedError);
  });

  it('back-to-back edits always return a strictly greater updatedAt', async () => {
    const merchantId = await freshMerchant();
    const customer = await seed(merchantId, '11999998888');
    let last = (await row(customer.id)).updatedAt;

    for (let i = 0; i < 20; i++) {
      const result = await repo.updateDetails(merchantId, customer.id, { name: `Nome ${i}` }, { ...ACTOR, expectedUpdatedAt: last });
      expect(result!.updatedAt.getTime()).toBeGreaterThan(last.getTime());
      last = result!.updatedAt;
    }
  });
});
