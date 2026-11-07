import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
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
import { products } from '@/modules/products/infrastructure/products.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions, cashMovements } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger, ownerPinAttempts } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import { Money } from '@/shared/domain/money';
import { CreditLimitExceededError } from '@/modules/customers/domain/errors';
import { CreateSaleUseCase } from './create-sale.use-case';
import { DrizzleSaleRepository } from '../infrastructure/drizzle-sale-repository';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleCashSessionRepository } from '@/modules/cash/infrastructure/drizzle-cash-session-repository';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleCustomerCreditRepository } from '@/modules/customers/infrastructure/drizzle-customer-credit-repository';
import { BcryptOwnerPinVerifier } from '@/modules/customers/infrastructure/bcrypt-owner-pin-verifier';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PIN = '123456';

describe.skipIf(!TEST_DATABASE_URL)('CreateSaleUseCase with the real Drizzle repositories (Postgres)', () => {
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

  function buildUseCase() {
    return new CreateSaleUseCase(
      new DrizzleSaleRepository(),
      new DrizzleProductRepository(),
      new DrizzleInventoryRepository(),
      new DrizzleCashSessionRepository(),
      {
        customerRepository: new DrizzleCustomerRepository(),
        customerCreditRepository: new DrizzleCustomerCreditRepository(),
        ownerPinVerifier: new BcryptOwnerPinVerifier(),
      }
    );
  }

  async function seedStore(creditLimit: string) {
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

    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const [product] = await database
      .insert(products)
      .values({ merchantId, barcode: `bc-${random}`, name: 'Pão', salePrice: '10.00' })
      .returning({ id: products.id });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: 5 });
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit })
      .returning({ id: customers.id });

    return { merchantId, ownerUsername, cashSessionId: session.id, productId: product.id, customerId: customer.id };
  }

  async function stockOf(productId: string) {
    const [row] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, productId));
    return row.qty;
  }

  it('records a cash sale with stock, cash receipt and audit in one go', async () => {
    const seed = await seedStore('100.00');

    const sale = await buildUseCase().execute({
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: 2 }],
      payments: [{ method: 'CASH', amount: Money.fromDecimal('20.00'), receivedAmount: Money.fromDecimal('20.00') }],
      idempotencyKey: `key-${uniqueKey()}`,
    });

    expect(await database.select().from(sales).where(eq(sales.id, sale.id))).toHaveLength(1);
    expect(await stockOf(seed.productId)).toBe(3);
    const receipts = await database
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.saleId, sale.id), eq(cashMovements.movementType, 'SALE_RECEIPT')));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].cashSessionId).toBe(seed.cashSessionId);
    expect(Money.fromDecimal(receipts[0].amount).toDecimal()).toBe('20.00');
    const audits = await database
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.aggregateId, sale.id), eq(auditEvents.eventType, 'SALE_CONFIRMED')));
    expect(audits).toHaveLength(1);
    expect(
      await database.select().from(inventoryMovements).where(eq(inventoryMovements.reason, `Venda ${sale.id}`))
    ).toHaveLength(1);
  });

  it('records a fiado sale within the limit as a debit and no cash receipt', async () => {
    const seed = await seedStore('100.00');

    const sale = await buildUseCase().execute({
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: 2 }],
      payments: [{ method: 'TAB', amount: Money.fromDecimal('20.00'), externalReference: seed.customerId }],
      idempotencyKey: `key-${uniqueKey()}`,
    });

    const ledger = await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.saleId, sale.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('DEBIT');
    expect(ledger[0].authorizedBy).toBeNull();
    expect(await database.select().from(cashMovements).where(eq(cashMovements.saleId, sale.id))).toHaveLength(0);
    expect(await stockOf(seed.productId)).toBe(3);
  });

  it('refuses a fiado sale above the limit without the owner PIN and writes nothing', async () => {
    const seed = await seedStore('15.00');

    await expect(
      buildUseCase().execute({
        merchantId: seed.merchantId,
        operatorId: 'op-1',
        items: [{ productId: seed.productId, quantity: 2 }],
        payments: [{ method: 'TAB', amount: Money.fromDecimal('20.00'), externalReference: seed.customerId }],
        idempotencyKey: `key-${uniqueKey()}`,
      })
    ).rejects.toBeInstanceOf(CreditLimitExceededError);

    expect(await stockOf(seed.productId)).toBe(5);
    expect(
      await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, seed.customerId))
    ).toHaveLength(0);
  });

  it('records the authorizing owner and the audit when the owner PIN approves an overrun', async () => {
    const seed = await seedStore('15.00');

    const sale = await buildUseCase().execute({
      merchantId: seed.merchantId,
      operatorId: 'op-1',
      items: [{ productId: seed.productId, quantity: 2 }],
      payments: [{ method: 'TAB', amount: Money.fromDecimal('20.00'), externalReference: seed.customerId }],
      idempotencyKey: `key-${uniqueKey()}`,
      ownerPin: OWNER_PIN,
    });

    const ledger = await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.saleId, sale.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].authorizedBy).toBe(seed.ownerUsername);
    const overrun = await database
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.aggregateId, seed.customerId), eq(auditEvents.eventType, 'CREDIT_SALE_LIMIT_AUTHORIZED'))
      );
    expect(overrun).toHaveLength(1);
    const [attempts] = await database
      .select({ failedCount: ownerPinAttempts.failedCount })
      .from(ownerPinAttempts)
      .where(eq(ownerPinAttempts.merchantId, seed.merchantId));
    expect(attempts.failedCount).toBe(0);
  });
});

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `${Date.now()}-${keyCounter}-${Math.random().toString(36).slice(2)}`;
}
