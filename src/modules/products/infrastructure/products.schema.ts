import { pgTable, varchar, uuid, boolean, timestamp, numeric, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { merchants } from '@/modules/users/infrastructure/users.schema';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  barcode: varchar('barcode', { length: 64 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  salePrice: numeric('sale_price', { precision: 19, scale: 4 }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_products_merchant_barcode').on(table.merchantId, table.barcode),
  index('idx_products_merchant_name').on(table.merchantId, table.name),
]);
