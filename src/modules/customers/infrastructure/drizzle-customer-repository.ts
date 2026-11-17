import { eq, ne, and, or, ilike, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { db } from '@/shared/infrastructure/db/connection';
import * as schema from '@/shared/infrastructure/db/schema';
import { customers } from './customers.schema';
import { Customer } from '../domain/customer';
import { CustomerChanges, CustomerRepository, CustomerUpdateContext } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, CustomerChangedError } from '../domain/errors';
import { auditEvents } from '@/modules/audit/infrastructure/audit.schema';
import { toAuditEventRow } from '@/modules/audit/infrastructure/audit-event-row';
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

  async updateDetails(
    merchantId: string,
    customerId: string,
    changes: CustomerChanges,
    { actorId, expectedUpdatedAt }: CustomerUpdateContext
  ): Promise<Customer | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const where = and(eq(customers.merchantId, merchantId), eq(customers.id, customerId));
        const [locked] = await tx.select().from(customers).where(where).for('update');
        if (!locked) return null;

        const before = toDomain(locked);
        if (expectedUpdatedAt && expectedUpdatedAt.getTime() !== before.updatedAt.getTime()) {
          throw new CustomerChangedError();
        }

        const after = before.withChanges(changes);
        const diff = before.changesTo(after);
        if (Object.keys(diff).length === 0) return before;

        if (diff.phone) {
          const [other] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(
              and(
                eq(customers.merchantId, merchantId),
                ne(customers.id, customerId),
                or(eq(customers.phone, after.phone), sql`${storedDigits} = ${phoneDigits(after.phone)}`)
              )
            )
            .limit(1);
          if (other) throw new CustomerAlreadyExistsError(after.phone);
        }

        const [row] = await tx
          .update(customers)
          .set({
            ...(diff.name && { name: after.name }),
            ...(diff.phone && { phone: after.phone }),
            // Strictly greater than the previous value, in whole milliseconds (the precision of expectedUpdatedAt).
            updatedAt: sql`GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', ${customers.updatedAt}) + interval '1 millisecond')`,
          })
          .where(where)
          .returning();

        await tx.insert(auditEvents).values(
          toAuditEventRow(merchantId, {
            eventType: 'CUSTOMER_UPDATED',
            actorId,
            aggregateType: 'CUSTOMER',
            aggregateId: customerId,
            details: { changes: diff },
          })
        );

        return toDomain(row);
      });
    } catch (error) {
      // A race on the unique index (merchant, phone) is the same domain conflict, without the driver text.
      if (isUniqueViolation(error)) throw new CustomerAlreadyExistsError(changes.phone ?? '');
      throw error;
    }
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
