import { pgTable, varchar, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { merchants } from '@/modules/users/infrastructure/users.schema';

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  actorId: varchar('actor_id', { length: 120 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 80 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_events_merchant').on(table.merchantId),
  index('idx_audit_events_aggregate').on(table.merchantId, table.aggregateType, table.aggregateId),
  index('idx_audit_events_created_at').on(table.merchantId, table.createdAt),
]);
