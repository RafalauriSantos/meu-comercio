import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { DrizzleInventoryRepository } from '@/modules/inventory/infrastructure/drizzle-inventory-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import * as schema from '@/shared/infrastructure/db/schema';
import { assertDisposableTestDatabase } from '@/shared/infrastructure/db/test-database-guard';
import { Money } from '@/shared/domain/money';
import { Product } from '../domain/product';
import { ProductBarcodeConflictError } from '../domain/product-errors';
import { isValidEan13 } from '../domain/generated-barcode';
import { CreateProductUseCase, BarcodeAlreadyExistsError, BarcodeGenerationFailedError } from '../application/create-product.use-case';
import { products } from './products.schema';
import { DrizzleProductRepository } from './drizzle-product-repository';

// The real Drizzle repository reads the global `db`. Point it at the disposable test database.
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

// Runs only when TEST_DATABASE_URL points to a disposable Postgres database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// Random source yielding the given digits in order (then repeating); each digit d gives d/10 + 0.05.
function digitsRandom(digits: string) {
  let i = 0;
  return () => Number(digits[i++ % digits.length]) / 10 + 0.05;
}

describe.skipIf(!TEST_DATABASE_URL)('create product with generated barcode (Postgres)', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const repo = new DrizzleProductRepository();

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

  async function freshMerchant(): Promise<string> {
    const [row] = await database
      .insert(merchants)
      .values({ name: `Loja ${Math.random().toString(36).slice(2)}` })
      .returning({ id: merchants.id });
    return row.id;
  }

  function useCase(random?: () => number) {
    return new CreateProductUseCase(repo, new DrizzleInventoryRepository(), new DrizzleAuditService(), random);
  }

  const BASE = { name: 'Arroz 5kg', salePrice: '24.90' };

  it('repo.create refuses a taken barcode with ProductBarcodeConflictError and leaves the existing row untouched', async () => {
    const merchantId = await freshMerchant();
    await repo.create(Product.create(merchantId, 'X1', 'Original', Money.fromDecimal('10.00')));

    await expect(repo.create(Product.create(merchantId, 'X1', 'Outro', Money.fromDecimal('99.00')))).rejects.toThrow(
      ProductBarcodeConflictError
    );

    const rows = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Original');
    expect(rows[0].salePrice).toBe('10.0000');
  });

  it('the same barcode is allowed in another shop', async () => {
    const a = await freshMerchant();
    const b = await freshMerchant();
    await repo.create(Product.create(a, 'X1', 'Loja A', Money.fromDecimal('1.00')));

    await expect(repo.create(Product.create(b, 'X1', 'Loja B', Money.fromDecimal('1.00')))).resolves.toBeUndefined();
  });

  it('creates with the generated code, stock row and audit marked barcodeGenerated', async () => {
    const merchantId = await freshMerchant();

    const product = await useCase().execute(merchantId, 'dona', { ...BASE, initialStock: 4 });

    expect(product.barcode).toMatch(/^29\d{11}$/);
    expect(isValidEan13(product.barcode)).toBe(true);
    const found = await repo.findByBarcode(merchantId, product.barcode);
    expect(found?.id).toBe(product.id);
    const [stock] = await database.select().from(inventoryItems).where(eq(inventoryItems.productId, product.id));
    expect(stock.availableQuantity).toBe(4);
    const events = await database.select().from(auditEvents).where(eq(auditEvents.aggregateId, product.id));
    const created = events.find((e) => e.eventType === 'PRODUCT_CREATED');
    expect(created?.details).toMatchObject({ barcode: product.barcode, barcodeGenerated: true });
  });

  it('a typed duplicate gives BarcodeAlreadyExistsError and keeps the first product', async () => {
    const merchantId = await freshMerchant();
    await useCase().execute(merchantId, 'dona', { ...BASE, barcode: '7891000100103' });

    await expect(useCase().execute(merchantId, 'dona', { ...BASE, name: 'Outro', barcode: '7891000100103' })).rejects.toThrow(
      BarcodeAlreadyExistsError
    );

    const rows = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Arroz 5kg');
  });

  it('two simultaneous creations without a barcode both win, with different codes', async () => {
    const merchantId = await freshMerchant();

    // Both draw the same first code; the second insert hits the unique index and draws again.
    const [a, b] = await Promise.all([
      useCase(digitsRandom('00000000001111111111')).execute(merchantId, 'dona', BASE),
      useCase(digitsRandom('00000000002222222222')).execute(merchantId, 'dona', { ...BASE, name: 'Feijão 1kg' }),
    ]);

    expect(a.barcode).not.toBe(b.barcode);
    const rows = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(rows).toHaveLength(2);
  });

  it('a collision the pre-check did not see (23505 on insert) is redrawn, not answered as 409', async () => {
    const merchantId = await freshMerchant();
    await repo.create(Product.create(merchantId, '2900000000001', 'Ocupa o primeiro código', Money.fromDecimal('1.00')));
    const blind = vi.spyOn(repo, 'findByBarcode').mockResolvedValue(null);

    try {
      const product = await useCase(digitsRandom('00000000003333333333')).execute(merchantId, 'dona', BASE);

      expect(product.barcode.startsWith('293333333333')).toBe(true);
      expect(blind).toHaveBeenCalled();
    } finally {
      blind.mockRestore();
    }
  });

  it('after 5 straight collisions nothing is written for the new product', async () => {
    const merchantId = await freshMerchant();
    await repo.create(Product.create(merchantId, '2900000000001', 'Ocupa o código', Money.fromDecimal('1.00')));

    await expect(useCase(digitsRandom('0')).execute(merchantId, 'dona', { ...BASE, initialStock: 5 })).rejects.toThrow(
      BarcodeGenerationFailedError
    );

    const rows = await database.select().from(products).where(eq(products.merchantId, merchantId));
    expect(rows).toHaveLength(1);
    const stock = await database.select().from(inventoryItems).where(eq(inventoryItems.merchantId, merchantId));
    expect(stock).toHaveLength(0);
  });
});
