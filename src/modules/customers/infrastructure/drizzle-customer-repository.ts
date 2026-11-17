import { eq, and, or, ilike, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import * as schema from '@/shared/infrastructure/db/schema';
import { customers } from './customers.schema';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError } from '../domain/errors';
import { phoneDigits } from '../domain/phone';
import { Money } from '@/shared/domain/money';

export type CustomerDatabase = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Legacy rows may hold a mask, so phones are also compared by their digits (D-21).
const storedDigits = sql`regexp_replace(${customers.phone}, '\\D', '', 'g')`;

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function toDomain(row: typeof customers.$inferSelect): Customer {
  return new Customer({
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    phone: row.phone,
    creditLimit: Money.fromDecimal(row.creditLimit),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly database: CustomerDatabase = db) {}

  async save(customer: Customer): Promise<void> {
    try {
      await this.insertOrUpdate(customer);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CustomerAlreadyExistsError(customer.phone);
      }
      throw error;
    }
  }

  private async insertOrUpdate(customer: Customer): Promise<void> {
    await this.database
      .insert(customers)
      .values({
        id: customer.id,
        merchantId: customer.merchantId,
        name: customer.name,
        phone: customer.phone,
        creditLimit: customer.creditLimit.toDecimal(),
        active: customer.active,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })
      .onConflictDoUpdate({
        target: [customers.id],
        set: {
          name: customer.name,
          phone: customer.phone,
          creditLimit: customer.creditLimit.toDecimal(),
          active: customer.active,
          updatedAt: customer.updatedAt,
        },
      });
  }

  async findById(merchantId: string, customerId: string): Promise<Customer | null> {
    const [row] = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.id, customerId)
        )
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByPhone(merchantId: string, phone: string): Promise<Customer | null> {
    const normalizedPhone = phone.trim();
    const digits = phoneDigits(normalizedPhone);
    const [row] = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          digits
            ? or(eq(customers.phone, normalizedPhone), sql`${storedDigits} = ${digits}`)
            : eq(customers.phone, normalizedPhone)
        )
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findAllActive(merchantId: string): Promise<Customer[]> {
    const rows = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          eq(customers.active, true)
        )
      )
      .orderBy(customers.name);

    return rows.map(toDomain);
  }

  async search(merchantId: string, query: string): Promise<Customer[]> {
    const trimmed = query.trim();
    const searchPattern = `%${trimmed}%`;
    const digits = phoneDigits(trimmed);

    const rows = await this.database
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.merchantId, merchantId),
          or(
            ilike(customers.name, searchPattern),
            ilike(customers.phone, searchPattern),
            digits ? sql`${storedDigits} like ${`%${digits}%`}` : undefined
          )
        )
      )
      .orderBy(customers.name)
      .limit(50);

    return rows.map(toDomain);
  }
}
