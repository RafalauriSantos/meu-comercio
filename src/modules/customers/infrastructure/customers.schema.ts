import { pgTable, varchar, uuid, timestamp, numeric, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { merchants } from '@/modules/users/infrastructure/users.schema';
import { sales } from '@/modules/sales/infrastructure/sales.schema';
import { cashSessions } from '@/modules/cash/infrastructure/cash.schema';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  name: varchar('name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 32 }).notNull(),
  creditLimit: numeric('credit_limit', { precision: 19, scale: 4 }).notNull().default('0'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_customers_merchant_phone').on(table.merchantId, table.phone),
  index('idx_customers_merchant_name').on(table.merchantId, table.name),
  index('idx_customers_merchant_active').on(table.merchantId, table.active),
]);

export const customerCreditLedger = pgTable('customer_credit_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 24 }).notNull(), // 'DEBIT' | 'CREDIT'
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  saleId: uuid('sale_id').references(() => sales.id),
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id),
  operatorId: varchar('operator_id', { length: 120 }).notNull(),
  authorizedBy: varchar('authorized_by', { length: 120 }),
  note: varchar('note', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_customer_credit_ledger_customer').on(table.merchantId, table.customerId, sql`${table.createdAt} DESC`),
  index('idx_customer_credit_ledger_sale').on(table.merchantId, table.saleId),
  index('idx_customer_credit_ledger_session').on(table.merchantId, table.cashSessionId),
]);
