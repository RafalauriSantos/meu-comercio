import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { AuditPort } from '@/modules/audit/domain/audit.port';
import { Customer } from '../domain/customer';
import { CreateCustomerUseCase } from '../application/create-customer.use-case';
import { CustomerAlreadyExistsError, InvalidPhoneError } from '../domain/errors';
import { customers } from './customers.schema';
import { DrizzleCustomerRepository } from './drizzle-customer-repository';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleCustomerRepository phone rule (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let repo: DrizzleCustomerRepository;
  let useCase: CreateCustomerUseCase;

  const audit: AuditPort = { record: async () => {} } as unknown as AuditPort;
  const noPinVerifier = { authorizeOwnerPin: async () => null, verifyOwnerPin: async () => false };

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
    repo = new DrizzleCustomerRepository(database);
    useCase = new CreateCustomerUseCase(repo, audit, noPinVerifier);
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

  async function insertLegacy(merchantId: string, phone: string) {
    await database.insert(customers).values({ merchantId, name: 'Dona Antiga', phone });
  }

  it('lista e acha por findByPhone um cliente antigo gravado com máscara', async () => {
    const merchantId = await freshMerchant();
    await insertLegacy(merchantId, '(11) 99999-8888');

    const all = await repo.findAllActive(merchantId);
    expect(all.map((c) => c.phone)).toEqual(['(11) 99999-8888']);

    const found = await repo.findByPhone(merchantId, '11999998888');
    expect(found?.name).toBe('Dona Antiga');
  });

  it('acha o cliente antigo na busca por dígitos e continua achando por nome', async () => {
    const merchantId = await freshMerchant();
    await insertLegacy(merchantId, '(11) 99999-8888');

    expect((await repo.search(merchantId, '11999998888')).length).toBe(1);
    expect((await repo.search(merchantId, '99999-8888')).length).toBe(1);
    expect((await repo.search(merchantId, '99998')).length).toBe(1);
    expect((await repo.search(merchantId, 'antiga')).length).toBe(1);
    expect((await repo.search(merchantId, '11888887777')).length).toBe(0);
  });

  it('a busca só com letras ou símbolos não casa todo mundo pelos dígitos', async () => {
    const merchantId = await freshMerchant();
    await insertLegacy(merchantId, '(11) 99999-8888');

    expect((await repo.search(merchantId, 'zzz')).length).toBe(0);
    expect((await repo.search(merchantId, '()')).length).toBe(0);
  });

  it('cadastrar o mesmo telefone em outro formato dá cliente repetido', async () => {
    const merchantId = await freshMerchant();
    await insertLegacy(merchantId, '(11) 99999-8888');

    await expect(
      useCase.execute({ merchantId, name: 'Nova', phone: '+55 11 99999-8888', operatorId: 'op' })
    ).rejects.toThrow(CustomerAlreadyExistsError);
  });

  it('guarda os dígitos e recusa o mesmo número cadastrado duas vezes', async () => {
    const merchantId = await freshMerchant();
    const created = await useCase.execute({
      merchantId,
      name: 'Nova',
      phone: '(11) 98888-7777',
      operatorId: 'op',
    });
    expect(created.phone).toBe('11988887777');

    await expect(
      useCase.execute({ merchantId, name: 'Outra', phone: '11988887777', operatorId: 'op' })
    ).rejects.toThrow(CustomerAlreadyExistsError);
  });

  it('traduz a violação do índice único (corrida) em cliente repetido', async () => {
    const merchantId = await freshMerchant();
    const racer = () => useCase.execute({ merchantId, name: 'Corrida', phone: '11977776666', operatorId: 'op' });

    const results = await Promise.allSettled([racer(), racer(), racer()]);
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(CustomerAlreadyExistsError);
    }
  });

  it('save traduz o erro 23505 do banco em cliente repetido, sem texto do driver', async () => {
    const merchantId = await freshMerchant();
    await repo.save(Customer.create({ merchantId, name: 'Um', phone: '11955554444' }));

    const duplicate = repo.save(Customer.create({ merchantId, name: 'Dois', phone: '11955554444' }));
    await expect(duplicate).rejects.toThrow(CustomerAlreadyExistsError);
    await expect(duplicate).rejects.not.toThrow(/idx_customers|duplicate key/);
  });

  it('permite o mesmo telefone em outra loja', async () => {
    const storeA = await freshMerchant();
    const storeB = await freshMerchant();
    await insertLegacy(storeA, '(11) 99999-8888');

    const created = await useCase.execute({
      merchantId: storeB,
      name: 'Outra loja',
      phone: '11999998888',
      operatorId: 'op',
    });
    expect(created.merchantId).toBe(storeB);
    expect(await repo.findByPhone(storeB, '11999998888')).not.toBeNull();
    expect((await repo.search(storeB, '11999998888')).length).toBe(1);
  });

  it('recusa telefone de 40 dígitos antes do banco', async () => {
    const merchantId = await freshMerchant();

    await expect(
      useCase.execute({ merchantId, name: 'Longo', phone: '1'.repeat(40), operatorId: 'op' })
    ).rejects.toThrow(InvalidPhoneError);
    expect(await repo.findAllActive(merchantId)).toHaveLength(0);
  });
});
