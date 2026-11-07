import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { inventoryItems, inventoryMovements } from '@/modules/inventory/infrastructure/inventory.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { sales } from './sales.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { Money } from '@/shared/domain/money';
import { Sale } from '../domain/sale';
import { SaleItem } from '../domain/sale-item';
import { Payment } from '../domain/payment';
import { CreditMovement } from '@/modules/customers/domain/credit-movement';
import { CreditLimitExceededError } from '@/modules/customers/domain/errors';
import { InsufficientStockError } from '@/modules/inventory/domain/inventory-item';
import { DrizzleSaleRepository } from './drizzle-sale-repository';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('DrizzleSaleRepository.commitSale (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedStore(stock: number, creditLimit: string) {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    const merchantId = merchant.id;

    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });

    const [product] = await database
      .insert(products)
      .values({
        merchantId,
        barcode: `bc-${Math.random().toString(36).slice(2)}`,
        name: 'Pão',
        salePrice: '10.00',
      })
      .returning({ id: products.id });

    await database
      .insert(inventoryItems)
      .values({ merchantId, productId: product.id, availableQuantity: stock });

    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Ana', phone: `${Math.random()}`.slice(2, 12), creditLimit })
      .returning({ id: customers.id });

    return { merchantId, cashSessionId: session.id, productId: product.id, customerId: customer.id };
  }

  async function addProduct(merchantId: string, stock: number): Promise<string> {
    const [product] = await database
      .insert(products)
      .values({ merchantId, barcode: `bc-${Math.random().toString(36).slice(2)}`, name: 'Leite', salePrice: '10.00' })
      .returning({ id: products.id });
    await database.insert(inventoryItems).values({ merchantId, productId: product.id, availableQuantity: stock });
    return product.id;
  }

  function buildTabSale(seed: { merchantId: string; cashSessionId: string; productId: string; customerId: string }, amount: string, quantity = 1) {
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    const unitPrice = Money.fromDecimal(amount).divide(quantity);
    sale.addItem(SaleItem.create(seed.productId, 'Pão', unitPrice, quantity));
    sale.confirmPayments([
      Payment.create('TAB', Money.fromDecimal(amount), { externalReference: seed.customerId }),
    ]);
    return sale;
  }

  function creditDebitFor(
    sale: Sale,
    seed: { merchantId: string; cashSessionId: string; customerId: string },
    amount: string,
    limit: string,
    holdMs = 0
  ) {
    const money = Money.fromDecimal(amount);
    const limitMoney = Money.fromDecimal(limit);
    return {
      customerId: seed.customerId,
      movement: CreditMovement.create({
        merchantId: seed.merchantId,
        customerId: seed.customerId,
        type: 'DEBIT',
        amount: money,
        operatorId: 'op-1',
        authorizedBy: null,
        saleId: sale.id,
        cashSessionId: seed.cashSessionId,
        note: 'Venda fiado',
      }),
      ensureWithinLimit: async (currentDebt: Money) => {
        // Holds the transaction open so a concurrent sale would read the same balance if unlocked.
        if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
        if (currentDebt.add(money).isGreaterThan(limitMoney)) {
          throw new CreditLimitExceededError();
        }
      },
    };
  }

  it('grava venda, baixa de estoque, débito e auditoria juntos', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = buildTabSale(seed, '20.00', 2);

    await repo.commitSale({
      sale,
      actorId: 'op-1',
      stockDeductions: [{ productId: seed.productId, quantity: 2 }],
      creditDebit: creditDebitFor(sale, seed, '20.00', '100.00'),
      audits: [
        {
          eventType: 'SALE_CONFIRMED',
          actorId: 'op-1',
          aggregateType: 'SALE',
          aggregateId: sale.id,
          details: {},
        },
      ],
    });

    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(3);
    expect(await database.select().from(sales).where(eq(sales.id, sale.id))).toHaveLength(1);
    expect(
      await database
        .select()
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.productId, seed.productId), eq(inventoryMovements.reason, `Venda ${sale.id}`)))
    ).toHaveLength(1);
    expect(
      await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.saleId, sale.id))
    ).toHaveLength(1);
    expect(
      await database.select().from(auditEvents).where(eq(auditEvents.aggregateId, sale.id))
    ).toHaveLength(1);
  });

  it('não grava nada quando a auditoria falha no meio da transação', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = buildTabSale(seed, '20.00', 2);

    await expect(
      repo.commitSale({
        sale,
        actorId: 'op-1',
        stockDeductions: [{ productId: seed.productId, quantity: 2 }],
        creditDebit: creditDebitFor(sale, seed, '20.00', '100.00'),
        audits: [
          {
            eventType: 'SALE_CONFIRMED',
            actorId: 'op-1',
            aggregateType: 'SALE',
            aggregateId: 'not-a-uuid',
            details: {},
          },
        ],
      })
    ).rejects.toThrow();

    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(5);
    expect(await database.select().from(sales).where(eq(sales.id, sale.id))).toHaveLength(0);
    expect(
      await database.select().from(customerCreditLedger).where(eq(customerCreditLedger.customerId, seed.customerId))
    ).toHaveLength(0);
  });

  it('não deixa duas vendas fiado simultâneas passarem juntas do limite', async () => {
    const seed = await seedStore(100, '100.00');
    const repo = new DrizzleSaleRepository(database);
    // Two different products, so only the customer row is shared between the sales.
    const otherProductId = await addProduct(seed.merchantId, 100);
    const seedB = { ...seed, productId: otherProductId };
    const saleA = buildTabSale(seed, '80.00');
    const saleB = buildTabSale(seedB, '80.00');

    const results = await Promise.allSettled([
      repo.commitSale({
        sale: saleA,
        actorId: 'op-1',
        stockDeductions: [{ productId: seed.productId, quantity: 1 }],
        creditDebit: creditDebitFor(saleA, seed, '80.00', '100.00', 300),
        audits: [],
      }),
      repo.commitSale({
        sale: saleB,
        actorId: 'op-1',
        stockDeductions: [{ productId: otherProductId, quantity: 1 }],
        creditDebit: creditDebitFor(saleB, seed, '80.00', '100.00'),
        audits: [],
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected && (rejected as PromiseRejectedResult).reason).toBeInstanceOf(CreditLimitExceededError);
    const debits = await database
      .select()
      .from(customerCreditLedger)
      .where(eq(customerCreditLedger.customerId, seed.customerId));
    expect(debits).toHaveLength(1);
  });

  it('não vende além do estoque quando duas vendas simultâneas pegam a última unidade', async () => {
    const seed = await seedStore(1, '0.00');
    const repo = new DrizzleSaleRepository(database);
    const saleA = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    const saleB = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    for (const s of [saleA, saleB]) {
      s.addItem(SaleItem.create(seed.productId, 'Pão', Money.fromDecimal('10.00'), 1));
      s.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'))]);
    }

    const results = await Promise.allSettled([
      repo.commitSale({ sale: saleA, actorId: 'op-1', stockDeductions: [{ productId: seed.productId, quantity: 1 }], audits: [] }),
      repo.commitSale({ sale: saleB, actorId: 'op-1', stockDeductions: [{ productId: seed.productId, quantity: 1 }], audits: [] }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(0);
  });
});
