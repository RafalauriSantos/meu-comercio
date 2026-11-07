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
import { cashMovements } from '@/modules/cash/infrastructure/cash.schema';
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
import { CashSessionNotOpenError } from '../domain/errors';
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

  // Holds a row lock on an inventory row from a separate connection, to force concurrent sales to queue.
  async function holdInventoryRowLock(productId: string) {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM inventory_items WHERE product_id = $1 FOR UPDATE', [productId]);
    return {
      async release() {
        await client.query('ROLLBACK');
        client.release();
      },
    };
  }

  // Waits until `count` statements on inventory_items are blocked on a lock.
  async function waitUntilBlocked(count: number) {
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%inventory_items%'`
      );
      if (rows[0].n >= count) return;
      if (Date.now() > deadline) throw new Error(`Expected ${count} blocked statements, saw ${rows[0].n}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
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
    ).rejects.toThrow(/insert into "audit_events"/);

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

  it('recusa a venda quando o caixa foi fechado no meio do atendimento e não grava nada', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    sale.addItem(SaleItem.create(seed.productId, 'Pão', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'))]);
    await database
      .update(cashSessions)
      .set({ status: 'CLOSED', closedBy: 'op-1', closedAt: new Date(), closingBalance: '0' })
      .where(eq(cashSessions.id, seed.cashSessionId));

    await expect(
      repo.commitSale({
        sale,
        actorId: 'op-1',
        stockDeductions: [{ productId: seed.productId, quantity: 1 }],
        cashReceipt: { cashSessionId: seed.cashSessionId, amount: Money.fromDecimal('10.00') },
        audits: [],
      })
    ).rejects.toBeInstanceOf(CashSessionNotOpenError);

    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(5);
    expect(await database.select().from(sales).where(eq(sales.id, sale.id))).toHaveLength(0);
    expect(await database.select().from(cashMovements).where(eq(cashMovements.saleId, sale.id))).toHaveLength(0);
  });

  it('recusa baixa de estoque com quantidade não positiva sem alterar o estoque', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    sale.addItem(SaleItem.create(seed.productId, 'Pão', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'))]);

    await expect(
      repo.commitSale({
        sale,
        actorId: 'op-1',
        stockDeductions: [{ productId: seed.productId, quantity: -1 }],
        audits: [],
      })
    ).rejects.toThrow(/positive integer/);

    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(5);
  });

  it('grava o recibo de caixa na mesma transação da venda', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    sale.addItem(SaleItem.create(seed.productId, 'Pão', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'))]);

    await repo.commitSale({
      sale,
      actorId: 'op-1',
      stockDeductions: [{ productId: seed.productId, quantity: 1 }],
      cashReceipt: { cashSessionId: seed.cashSessionId, amount: Money.fromDecimal('10.00') },
      audits: [],
    });

    const receipts = await database
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.saleId, sale.id), eq(cashMovements.movementType, 'SALE_RECEIPT')));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].amount).toBe('10.0000');
  });

  it('não grava venda nem baixa de estoque quando o recibo de caixa falha', async () => {
    const seed = await seedStore(5, '100.00');
    const repo = new DrizzleSaleRepository(database);
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    sale.addItem(SaleItem.create(seed.productId, 'Pão', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('10.00'))]);

    await expect(
      repo.commitSale({
        sale,
        actorId: 'op-1',
        stockDeductions: [{ productId: seed.productId, quantity: 1 }],
        cashReceipt: { cashSessionId: 'not-a-uuid', amount: Money.fromDecimal('10.00') },
        audits: [],
      })
    ).rejects.toThrow(/insert into "cash_movements"/);

    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(5);
    expect(await database.select().from(sales).where(eq(sales.id, sale.id))).toHaveLength(0);
    expect(await database.select().from(inventoryMovements).where(eq(inventoryMovements.reason, `Venda ${sale.id}`))).toHaveLength(0);
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

    // Both sales are started while the row is locked from outside, so they truly overlap.
    const held = await holdInventoryRowLock(seed.productId);
    const pending = Promise.allSettled([
      repo.commitSale({ sale: saleA, actorId: 'op-1', stockDeductions: [{ productId: seed.productId, quantity: 1 }], audits: [] }),
      repo.commitSale({ sale: saleB, actorId: 'op-1', stockDeductions: [{ productId: seed.productId, quantity: 1 }], audits: [] }),
    ]);
    await waitUntilBlocked(2);
    await held.release();
    const results = await pending;

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    const [stock] = await database
      .select({ qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, seed.productId));
    expect(stock.qty).toBe(0);
  });

  it('trava as linhas de estoque em ordem fixa, qualquer que seja a ordem dos itens da venda', async () => {
    const seed = await seedStore(5, '0.00');
    const otherProductId = await addProduct(seed.merchantId, 5);
    const [low, high] = [seed.productId, otherProductId].sort();
    const repo = new DrizzleSaleRepository(database);
    const sale = Sale.create(seed.merchantId, seed.cashSessionId, 'op-1', { idempotencyKey: null });
    sale.addItem(SaleItem.create(high, 'Leite', Money.fromDecimal('10.00'), 1));
    sale.addItem(SaleItem.create(low, 'Pão', Money.fromDecimal('10.00'), 1));
    sale.confirmPayments([Payment.create('CASH', Money.fromDecimal('20.00'))]);

    // The sale asks for the higher id first. A fixed order must still queue on the lower id first.
    const held = await holdInventoryRowLock(low);
    const pending = repo.commitSale({
      sale,
      actorId: 'op-1',
      stockDeductions: [
        { productId: high, quantity: 1 },
        { productId: low, quantity: 1 },
      ],
      audits: [],
    });
    await waitUntilBlocked(1);

    // If the sale had locked the higher id first, this NOWAIT lock would fail with 55P03.
    const probe = await pool.connect();
    try {
      await probe.query('BEGIN');
      await probe.query('SELECT 1 FROM inventory_items WHERE product_id = $1 FOR UPDATE NOWAIT', [high]);
      await probe.query('ROLLBACK');
    } finally {
      probe.release();
    }

    await held.release();
    await pending;
    const rows = await database
      .select({ id: inventoryItems.productId, qty: inventoryItems.availableQuantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.merchantId, seed.merchantId));
    expect(rows.map((r) => r.qty)).toEqual([4, 4]);
  });
});
