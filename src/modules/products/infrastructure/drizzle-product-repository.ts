import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { products } from './products.schema';
import { Product } from '../domain/product';
import { inventoryItems } from '@/modules/inventory/infrastructure/inventory.schema';
import { ProductRepository, ProductListPage, ProductListPageParams, ProductsSummary } from '../domain/product-repository.port';
import { RESTOCK_THRESHOLD_UNITS, RESTOCK_THRESHOLD_GRAMS } from '../domain/product-stock-rule';
import { Money } from '@/shared/domain/money';
import { isProductUnit } from '@/shared/domain/product-unit';

function toDomain(row: typeof products.$inferSelect): Product {
  return new Product({
    id: row.id,
    merchantId: row.merchantId,
    barcode: row.barcode,
    name: row.name,
    salePrice: Money.fromDecimal(row.salePrice),
    unit: isProductUnit(row.unit) ? row.unit : 'UN',
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProductRepository implements ProductRepository {
  async save(product: Product): Promise<void> {
    await db
      .insert(products)
      .values({
        id: product.id,
        merchantId: product.merchantId,
        barcode: product.barcode,
        name: product.name,
        salePrice: product.salePrice.toDecimal(),
        // Not part of the update below: the unit of a product that already exists never changes here.
        unit: product.unit,
        active: product.active,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })
      .onConflictDoUpdate({
        target: [products.merchantId, products.barcode],
        set: {
          name: product.name,
          salePrice: product.salePrice.toDecimal(),
          active: product.active,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }

  async findByBarcode(merchantId: string, barcode: string): Promise<Product | null> {
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.merchantId, merchantId),
          eq(products.barcode, barcode.trim())
        )
      )
      .limit(1);

    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(merchantId: string, id: string): Promise<Product | null> {
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.merchantId, merchantId),
          eq(products.id, id)
        )
      )
      .limit(1);

    return rows[0] ? toDomain(rows[0]) : null;
  }

  async searchByNameOrBarcode(merchantId: string, query: string, limit = 20): Promise<Product[]> {
    const searchPattern = `%${query.trim()}%`;
    const rows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.merchantId, merchantId),
          eq(products.active, true),
          or(
            ilike(products.barcode, searchPattern),
            ilike(products.name, searchPattern)
          )
        )
      )
      .limit(limit);

    return rows.map(toDomain);
  }

  async listPage(merchantId: string, { query, page, pageSize }: ProductListPageParams): Promise<ProductListPage> {
    const searchPattern = `%${query.trim()}%`;
    const rows = await db
      .select({
        product: products,
        availableQuantity: sql<number>`coalesce(${inventoryItems.availableQuantity}, 0)`.mapWith(Number),
      })
      .from(products)
      .leftJoin(
        inventoryItems,
        and(eq(inventoryItems.merchantId, products.merchantId), eq(inventoryItems.productId, products.id))
      )
      .where(
        and(
          eq(products.merchantId, merchantId),
          eq(products.active, true),
          or(ilike(products.barcode, searchPattern), ilike(products.name, searchPattern))
        )
      )
      .orderBy(products.name, products.id)
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);

    return {
      items: rows.slice(0, pageSize).map((row) => ({
        product: toDomain(row.product),
        availableQuantity: row.availableQuantity,
      })),
      hasMore: rows.length > pageSize,
    };
  }

  // One aggregate query. The value mirrors the screen (stock.ts inventoryValue): price at 2 decimals as the
  // API sends it, in cents; by weight, price x grams / 1000 rounded half up per product (numeric round is half
  // away from zero, the same for the non-negative quantities used here).
  async getSummary(merchantId: string): Promise<ProductsSummary> {
    const quantity = sql`coalesce(${inventoryItems.availableQuantity}, 0)`;
    const priceCents = sql`round(${products.salePrice}, 2) * 100`;
    const [row] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        lowStockCount: sql<number>`count(*) filter (where ${quantity} <= case when ${products.unit} = 'KG' then ${sql.raw(String(RESTOCK_THRESHOLD_GRAMS))} else ${sql.raw(String(RESTOCK_THRESHOLD_UNITS))} end)`.mapWith(Number),
        outOfStockCount: sql<number>`count(*) filter (where ${quantity} <= 0)`.mapWith(Number),
        stockValueCents: sql<string>`coalesce(sum(case when ${products.unit} = 'KG' then round(${priceCents} * greatest(${quantity}, 0) / 1000) else ${priceCents} * greatest(${quantity}, 0) end), 0)::text`,
      })
      .from(products)
      .leftJoin(
        inventoryItems,
        and(eq(inventoryItems.merchantId, products.merchantId), eq(inventoryItems.productId, products.id))
      )
      .where(and(eq(products.merchantId, merchantId), eq(products.active, true)));

    return {
      total: row.total,
      lowStockCount: row.lowStockCount,
      outOfStockCount: row.outOfStockCount,
      stockValue: Money.fromCents(Number(row.stockValueCents)),
    };
  }
}
