import { pgTable, varchar, uuid, timestamp, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';

export const inventoryItems = pgTable('inventory_items', {
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  availableQuantity: integer('available_quantity').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.merchantId, table.productId], name: 'pk_inventory_items' }),
]);

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  movementType: varchar('movement_type', { length: 32 }).notNull(),
  quantity: integer('quantity').notNull(),
  reason: varchar('reason', { length: 240 }).notNull(),
  actorId: varchar('actor_id', { length: 120 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_inventory_movements_product_created').on(table.merchantId, table.productId, sql`${table.createdAt} DESC`),
]);
