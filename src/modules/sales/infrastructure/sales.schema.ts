import { pgTable, varchar, uuid, timestamp, numeric, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { products } from '@/modules/products/infrastructure/products.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';

export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id),
  operatorId: varchar('operator_id', { length: 120 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PENDING_PAYMENT'),
  subtotal: numeric('subtotal', { precision: 19, scale: 4 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 19, scale: 4 }).notNull().default('0'),
  total: numeric('total', { precision: 19, scale: 4 }).notNull(),
  cashReceived: numeric('cash_received', { precision: 19, scale: 4 }),
  changeAmount: numeric('change_amount', { precision: 19, scale: 4 }).notNull().default('0'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_sales_merchant_idempotency')
    .on(table.merchantId, table.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),
  index('idx_sales_merchant_created').on(table.merchantId, sql`${table.createdAt} DESC`),
  index('idx_sales_merchant_session').on(table.merchantId, table.cashSessionId),
]);

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 160 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 19, scale: 4 }).notNull(),
  quantity: integer('quantity').notNull(),
  subtotal: numeric('subtotal', { precision: 19, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_sale_items_merchant_sale').on(table.merchantId, table.saleId),
  index('idx_sale_items_merchant_product').on(table.merchantId, table.productId),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  method: varchar('method', { length: 32 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('APPROVED'),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  receivedAmount: numeric('received_amount', { precision: 19, scale: 4 }).notNull(),
  changeAmount: numeric('change_amount', { precision: 19, scale: 4 }).notNull().default('0'),
  installments: integer('installments').notNull().default(1),
  externalReference: varchar('external_reference', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_payments_merchant_sale').on(table.merchantId, table.saleId),
  index('idx_payments_merchant_method').on(table.merchantId, table.method),
]);
