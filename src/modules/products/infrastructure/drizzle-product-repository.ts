import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import { products } from './products.schema';
import { Product } from '../domain/product';
import { ProductRepository } from '../domain/product-repository.port';
import { Money } from '@/shared/domain/money';

function toDomain(row: typeof products.$inferSelect): Product {
  return new Product({
    id: row.id,
    merchantId: row.merchantId,
    barcode: row.barcode,
    name: row.name,
    salePrice: Money.fromDecimal(row.salePrice),
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
}
