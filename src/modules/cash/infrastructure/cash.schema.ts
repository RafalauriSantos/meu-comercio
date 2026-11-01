import { pgTable, varchar, uuid, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { merchants } from '@/modules/users/infrastructure/users.schema';

export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  openedBy: varchar('opened_by', { length: 120 }).notNull(),
  openingBalance: numeric('opening_balance', { precision: 19, scale: 4 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  status: varchar('status', { length: 16 }).notNull().default('OPEN'),
  closedBy: varchar('closed_by', { length: 120 }),
  closingBalance: numeric('closing_balance', { precision: 19, scale: 4 }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idx_one_open_cash_session_per_merchant')
    .on(table.merchantId, table.status)
    .where(sql`status = 'OPEN'`),
  index('idx_cash_sessions_merchant').on(table.merchantId),
]);

export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  cashSessionId: uuid('cash_session_id').notNull().references(() => cashSessions.id),
  saleId: uuid('sale_id'),
  movementType: varchar('movement_type', { length: 32 }).notNull(),
  amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
  reason: varchar('reason', { length: 255 }),
  operatorId: varchar('operator_id', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_cash_movements_session').on(table.cashSessionId),
  index('idx_cash_movements_merchant').on(table.merchantId),
]);
