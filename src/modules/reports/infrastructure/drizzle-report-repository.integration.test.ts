import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';
import { customers, customerCreditLedger } from '@/modules/customers/infrastructure/customers.schema';
import { sales, saleItems, payments } from '@/modules/sales/infrastructure/sales.schema';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { DrizzleReportRepository } from './drizzle-report-repository';

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
// CI provides one in the integration job. Never point it at production.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const TIME_ZONE = 'America/Sao_Paulo';
// 9 Nov 2026 in Brasília: from 03:00 UTC to 03:00 UTC of the next day (the end is not included).
const START = new Date('2026-11-09T03:00:00Z');
const END = new Date('2026-11-10T03:00:00Z');

const money = (text: string) => Number(text);

describe.skipIf(!TEST_DATABASE_URL)('DrizzleReportRepository (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let repository: DrizzleReportRepository<typeof schema>;

  beforeAll(async () => {
    assertDisposableTestDatabase(TEST_DATABASE_URL!);
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    database = drizzle(pool, { schema });
    repository = new DrizzleReportRepository(database);
    await migrate(database, { migrationsFolder: 'drizzle/migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedShop() {
    const [merchant] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    const merchantId = merchant.id;
    const [session] = await database
      .insert(cashSessions)
      .values({ merchantId, openedBy: 'op-1', openingBalance: '0' })
      .returning({ id: cashSessions.id });
    const [rice] = await database
      .insert(products)
      .values({ merchantId, barcode: '1', name: 'Arroz 5kg', salePrice: '25.50', unit: 'UN' })
      .returning({ id: products.id });
    const [cheese] = await database
      .insert(products)
      .values({ merchantId, barcode: '2', name: 'Queijo Mussarela', salePrice: '42.90', unit: 'KG' })
      .returning({ id: products.id });
    const [customer] = await database
      .insert(customers)
      .values({ merchantId, name: 'Dona Maria', phone: `+55${Math.floor(Math.random() * 1e9)}`, creditLimit: '500' })
      .returning({ id: customers.id });
    return { merchantId, cashSessionId: session.id, riceId: rice.id, cheeseId: cheese.id, customerId: customer.id };
  }

  type Shop = Awaited<ReturnType<typeof seedShop>>;

  async function addSale(
    shop: Shop,
    sale: { status: string; total: string; at: string; operator: string },
    options: {
      items?: Array<{ productId: string; name: string; unitPrice: string; quantity: number; unit: string; subtotal: string }>;
      payments?: Array<{ method: string; amount: string; received?: string }>;
    } = {}
  ) {
    const [row] = await database
      .insert(sales)
      .values({
        merchantId: shop.merchantId,
        cashSessionId: shop.cashSessionId,
        operatorId: sale.operator,
        status: sale.status,
        subtotal: sale.total,
        total: sale.total,
        createdAt: new Date(sale.at),
      })
      .returning({ id: sales.id });
    for (const item of options.items ?? []) {
      await database.insert(saleItems).values({
        merchantId: shop.merchantId,
        saleId: row.id,
        productId: item.productId,
        productName: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        unit: item.unit,
        subtotal: item.subtotal,
      });
    }
    for (const payment of options.payments ?? []) {
      await database.insert(payments).values({
        merchantId: shop.merchantId,
        saleId: row.id,
        method: payment.method,
        amount: payment.amount,
        receivedAmount: payment.received ?? payment.amount,
      });
    }
    return row.id;
  }

  async function seedDay() {
    const shop = await seedShop();

    // 22:00 in Brasília on 9 Nov is already 10 Nov in UTC, and must be counted on the 9th.
    await addSale(
      shop,
      { status: 'CONFIRMED', total: '66.02', at: '2026-11-10T01:00:00Z', operator: 'tatiane' },
      {
        items: [
          { productId: shop.riceId, name: 'Arroz 5kg', unitPrice: '25.50', quantity: 2, unit: 'UN', subtotal: '51.00' },
          { productId: shop.cheeseId, name: 'Queijo Mussarela', unitPrice: '42.90', quantity: 350, unit: 'KG', subtotal: '15.02' },
        ],
        // 50.00 handed over for a 40.00 payment: the 10.00 of change is not a sale.
        payments: [
          { method: 'CASH', amount: '40.00', received: '50.00' },
          { method: 'PIX', amount: '26.02' },
        ],
      }
    );
    const fiadoSale = await addSale(
      shop,
      { status: 'CONFIRMED', total: '30.00', at: '2026-11-09T15:00:00Z', operator: 'marcos' },
      { payments: [{ method: 'TAB', amount: '30.00' }] }
    );
    const cancelled = await addSale(shop, { status: 'CANCELLED', total: '20.00', at: '2026-11-09T16:00:00Z', operator: 'tatiane' });
    // Exactly at the end of the window (not included) and one second before its start (not included).
    await addSale(shop, { status: 'CONFIRMED', total: '500.00', at: '2026-11-10T03:00:00Z', operator: 'tatiane' });
    await addSale(shop, { status: 'CONFIRMED', total: '77.00', at: '2026-11-09T02:59:59Z', operator: 'tatiane' });

    await database.insert(customerCreditLedger).values([
      { merchantId: shop.merchantId, customerId: shop.customerId, type: 'DEBIT', amount: '30.00', saleId: fiadoSale, operatorId: 'marcos', createdAt: new Date('2026-11-09T15:00:00Z') },
      // A debt settled at the counter: fiado received.
      { merchantId: shop.merchantId, customerId: shop.customerId, type: 'CREDIT', amount: '12.00', operatorId: 'tatiane', createdAt: new Date('2026-11-09T18:00:00Z') },
      // The refund of the cancelled sale is also a CREDIT, but it points at a sale: not fiado received.
      { merchantId: shop.merchantId, customerId: shop.customerId, type: 'CREDIT', amount: '20.00', saleId: cancelled, operatorId: 'tatiane', createdAt: new Date('2026-11-09T16:30:00Z') },
      // A settlement outside the window.
      { merchantId: shop.merchantId, customerId: shop.customerId, type: 'CREDIT', amount: '99.00', operatorId: 'tatiane', createdAt: new Date('2026-11-12T18:00:00Z') },
    ]);

    return shop;
  }

  it('counts only the confirmed sales of the window, the end not included', async () => {
    const shop = await seedDay();

    const window = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(window.confirmed.count).toBe(2);
    expect(money(window.confirmed.total)).toBe(96.02);
  });

  it('keeps the cancelled sales out of the total and reports them apart', async () => {
    const shop = await seedDay();

    const window = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(window.cancelled.count).toBe(1);
    expect(money(window.cancelled.total)).toBe(20);
  });

  it('adds up what each method took in, and the change is not counted', async () => {
    const shop = await seedDay();

    const { byPayment } = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    const byMethod = Object.fromEntries(byPayment.map((row) => [row.method, money(row.amount)]));
    expect(byMethod).toEqual({ CASH: 40, PIX: 26.02, TAB: 30 });
    expect(byPayment.find((row) => row.method === 'CASH')?.count).toBe(1);
  });

  it('puts a sale at 22:00 in Brasília on its own day, not on the next one (UTC)', async () => {
    const shop = await seedDay();

    const { byDay } = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(byDay).toHaveLength(1);
    expect(byDay[0].date).toBe('2026-11-09');
    expect(byDay[0].count).toBe(2);
    expect(money(byDay[0].total)).toBe(96.02);
  });

  it('lists the best sellers, a weight in grams with its unit, from the confirmed sales only', async () => {
    const shop = await seedDay();

    const { topProducts } = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(topProducts.map((row) => [row.name, row.unit, row.quantity, money(row.amount)])).toEqual([
      ['Arroz 5kg', 'UN', 2, 51],
      ['Queijo Mussarela', 'KG', 350, 15.02],
    ]);
  });

  it('adds up each operator, the biggest first', async () => {
    const shop = await seedDay();

    const { byOperator } = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(byOperator.map((row) => [row.operatorId, row.count, money(row.total)])).toEqual([
      ['tatiane', 1, 66.02],
      ['marcos', 1, 30],
    ]);
  });

  it('counts as fiado received only the debts settled in the window, not the refund of a cancelled sale', async () => {
    const shop = await seedDay();

    const window = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(money(window.fiadoReceived)).toBe(12);
  });

  it('sums a wider window with the sales on both edges, to compare periods', async () => {
    const shop = await seedDay();

    const wide = await repository.getConfirmedTotals(
      shop.merchantId,
      new Date('2026-11-08T03:00:00Z'),
      new Date('2026-11-11T03:00:00Z')
    );

    expect(wide.count).toBe(4);
    expect(money(wide.total)).toBe(673.02);
  });

  it('never mixes the sales of two shops', async () => {
    const shopA = await seedDay();
    const shopB = await seedShop();
    await addSale(shopB, { status: 'CONFIRMED', total: '999.00', at: '2026-11-09T15:00:00Z', operator: 'outra' }, {
      payments: [{ method: 'CASH', amount: '999.00' }],
    });

    const a = await repository.getSalesWindow(shopA.merchantId, START, END, TIME_ZONE);
    const b = await repository.getSalesWindow(shopB.merchantId, START, END, TIME_ZONE);

    expect(money(a.confirmed.total)).toBe(96.02);
    expect(b.confirmed).toMatchObject({ count: 1 });
    expect(money(b.confirmed.total)).toBe(999);
    expect(b.byOperator.map((row) => row.operatorId)).toEqual(['outra']);
  });

  it('answers with zeros for a shop that sold nothing', async () => {
    const shop = await seedShop();

    const window = await repository.getSalesWindow(shop.merchantId, START, END, TIME_ZONE);

    expect(window.confirmed).toEqual({ count: 0, total: '0' });
    expect(window.byPayment).toEqual([]);
    expect(window.byDay).toEqual([]);
    expect(window.topProducts).toEqual([]);
    expect(money(window.fiadoReceived)).toBe(0);
  });
});
