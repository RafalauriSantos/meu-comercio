import { pgTable, varchar, uuid, boolean, integer, timestamp, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appUsers = pgTable('app_users', {
  username: varchar('username', { length: 120 }).primaryKey(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  authorizationPinHash: varchar('authorization_pin_hash', { length: 255 }),
  email: varchar('email', { length: 254 }),
  enabled: boolean('enabled').notNull().default(true),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_app_users_merchant_username').on(table.merchantId, table.username),
  uniqueIndex('uq_app_users_owner_email').on(table.merchantId, table.email),
]);

export const userAuthorities = pgTable('user_authorities', {
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  username: varchar('username', { length: 120 }).notNull(),
  authority: varchar('authority', { length: 120 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.merchantId, table.username, table.authority], name: 'pk_user_authorities' }),
]);

export const ownerRecoveryTokens = pgTable('owner_recovery_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  username: varchar('username', { length: 120 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
